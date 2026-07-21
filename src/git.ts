import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

/**
 * Extract all TypeScript files from the project at a given git ref into a
 * temporary directory. Returns the temp directory path.
 *
 * Uses `git ls-tree` to list files and `git show <ref>:<path>` to read each
 * file — no checkout, no stash, no repo state mutation.
 *
 * Throws if the directory is not a git repo or the ref is invalid.
 */
function verifyGitRepo(projectPath: string): void {
  try {
    execSync('git rev-parse --git-dir', { cwd: projectPath, stdio: 'pipe' })
  } catch {
    throw new Error(`Not a git repository: ${projectPath}`)
  }
}

function verifyRefExists(projectPath: string, ref: string): void {
  try {
    execFileSync('git', ['rev-parse', '--verify', ref], { cwd: projectPath, stdio: 'pipe' })
  } catch {
    throw new Error(`Invalid git ref: '${ref}'. Run 'git log --oneline' to see available commits.`)
  }
}

function listTsFilesAtRef(projectPath: string, ref: string): string[] {
  let fileList: string
  try {
    fileList = execFileSync(
      'git', ['ls-tree', '-r', '--name-only', ref],
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' },
    )
  } catch {
    throw new Error(`Failed to list files at ref '${ref}'`)
  }

  return fileList
    .split('\n')
    .map(f => f.trim())
    .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) && !f.endsWith('.d.ts'))
}

function extractFile(projectPath: string, ref: string, filePath: string, tempDir: string): void {
  let content: string
  try {
    content = execFileSync(
      'git', ['show', `${ref}:${filePath}`],
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' },
    )
  } catch {
    return
  }

  const destPath = join(tempDir, filePath.split('/').join(sep))
  const destDir = destPath.substring(0, destPath.lastIndexOf(sep))
  mkdirSync(destDir, { recursive: true })
  writeFileSync(destPath, content, 'utf-8')
}

function extractArchiveAtRef(projectPath: string, ref: string, tempDir: string): boolean {
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', ref], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    execFileSync('tar', ['-x', '-C', tempDir], {
      input: archive,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

export function extractFilesAtRef(projectPath: string, ref: string): string {
  verifyGitRepo(projectPath)
  verifyRefExists(projectPath, ref)

  const tsFiles = listTsFilesAtRef(projectPath, ref)

  if (tsFiles.length === 0) {
    throw new Error(`No TypeScript files found at ref '${ref}'`)
  }

  const tempDir = join(tmpdir(), `drift-diff-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  if (extractArchiveAtRef(projectPath, ref, tempDir)) {
    return tempDir
  }

  for (const filePath of tsFiles) {
    extractFile(projectPath, ref, filePath, tempDir)
  }

  return tempDir
}

/**
 * Clean up a temporary directory created by extractFilesAtRef.
 */
export function cleanupTempDir(tempDir: string): void {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * Get the short hash of a git ref for display purposes.
 */
function resolveRefHash(projectPath: string, ref: string): string {
  try {
    return execFileSync(
      'git', ['rev-parse', '--short', ref],
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' },
    ).trim()
  } catch {
    return ref
  }
}

/**
 * Read the unified diff of staged changes in a git repository.
 * Returns an empty string when nothing is staged.
 */
export function readStagedDiff(projectPath: string): string {
  verifyGitRepo(projectPath)

  try {
    return execSync('git diff --cached --no-color', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  } catch {
    return ''
  }
}

/**
 * Read the unified diff between the working tree and a git ref.
 */
export function readDiffFromBase(projectPath: string, ref: string): string {
  verifyGitRepo(projectPath)
  verifyRefExists(projectPath, ref)

  try {
    return execFileSync('git', ['diff', '--no-color', ref], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  } catch {
    return ''
  }
}
