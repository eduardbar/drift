import { execSync } from 'node:child_process'
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
export function extractFilesAtRef(projectPath: string, ref: string): string {
  // Verify git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: projectPath, stdio: 'pipe' })
  } catch {
    throw new Error(`Not a git repository: ${projectPath}`)
  }

  // Verify ref exists
  try {
    execSync(`git rev-parse --verify ${ref}`, { cwd: projectPath, stdio: 'pipe' })
  } catch {
    throw new Error(`Invalid git ref: '${ref}'. Run 'git log --oneline' to see available commits.`)
  }

  // List all .ts files tracked at this ref (excluding .d.ts)
  let fileList: string
  try {
    fileList = execSync(
      `git ls-tree -r --name-only ${ref}`,
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
    )
  } catch {
    throw new Error(`Failed to list files at ref '${ref}'`)
  }

  const tsFiles = fileList
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))

  if (tsFiles.length === 0) {
    throw new Error(`No TypeScript files found at ref '${ref}'`)
  }

  // Create temp directory
  const tempDir = join(tmpdir(), `drift-diff-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  // Extract each file
  for (const filePath of tsFiles) {
    let content: string
    try {
      content = execSync(
        `git show ${ref}:${filePath}`,
        { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
      )
    } catch {
      // File may not exist at this ref — skip
      continue
    }

    const destPath = join(tempDir, filePath.split('/').join(sep))
    const destDir = destPath.substring(0, destPath.lastIndexOf(sep))
    mkdirSync(destDir, { recursive: true })
    writeFileSync(destPath, content, 'utf-8')
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
export function resolveRefHash(projectPath: string, ref: string): string {
  try {
    return execSync(
      `git rev-parse --short ${ref}`,
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
    ).trim()
  } catch {
    return ref
  }
}
