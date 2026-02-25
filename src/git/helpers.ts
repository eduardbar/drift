// drift-ignore-file
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { Project } from 'ts-morph'
import type { SourceFile } from 'ts-morph'
import type { FileReport, DriftConfig, HistoricalAnalysis } from '../types.js'

/**
 * Analyse a file given its absolute path string.
 * Accepts analyzeFile as a parameter to avoid circular dependency.
 */
export function analyzeFilePath(
  filePath: string,
  analyzeFile: (sf: SourceFile) => FileReport,
): FileReport {
  const proj = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  })
  const sf = proj.addSourceFileAtPath(filePath)
  return analyzeFile(sf)
}

/**
 * Execute a git command synchronously and return stdout.
 * Throws a descriptive error if the command fails or git is not available.
 */
export function execGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Git command failed: ${cmd}\n${msg}`)
  }
}

/**
 * Verify the given directory is a git repository.
 * Throws if git is not available or the directory is not a repo.
 */
export function assertGitRepo(cwd: string): void {
  try {
    execGit('git rev-parse --is-inside-work-tree', cwd)
  } catch {
    throw new Error(`Directory is not a git repository: ${cwd}`)
  }
}

/**
 * Analyse a single file as it existed at a given commit hash.
 * Writes the blob to a temp file, runs analyzeFile, then cleans up.
 */
export async function analyzeFileAtCommit( // drift-ignore
  filePath: string,
  commitHash: string,
  projectRoot: string,
  analyzeFile: (sf: SourceFile) => FileReport,
): Promise<FileReport> {
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/')
  const blob = execGit(`git show ${commitHash}:${relPath}`, projectRoot)

  const tmpFile = path.join(os.tmpdir(), `drift-${crypto.randomBytes(8).toString('hex')}.ts`)
  try {
    fs.writeFileSync(tmpFile, blob, 'utf8')
    const report = analyzeFilePath(tmpFile, analyzeFile)
    // Replace temp path with original for readable output
    return { ...report, path: filePath }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore cleanup errors */ } // drift-ignore
  }
}

/**
 * Analyse ALL TypeScript files in the project snapshot at a given commit.
 * Uses `git ls-tree` to enumerate every file in the tree, writes them to a
 * temp directory, then runs `analyzeProject` on that full snapshot.
 */
export async function analyzeSingleCommit( // drift-ignore
  commitHash: string,
  targetPath: string,
  analyzeProject: (targetPath: string, config?: DriftConfig) => FileReport[],
  config?: DriftConfig,
): Promise<HistoricalAnalysis> {
  // 1. Commit metadata
  const meta = execGit(
    `git show --no-patch --format="%H|%aI|%an|%s" ${commitHash}`,
    targetPath,
  )
  const [hash, dateStr, author, ...msgParts] = meta.split('|')
  const message = msgParts.join('|').trim()
  const commitDate = new Date(dateStr ?? '')

  // 2. All .ts/.tsx files tracked at this commit (no diffs, full tree)
  const allFiles = execGit(
    `git ls-tree -r ${commitHash} --name-only`,
    targetPath,
  )
    .split('\n')
    .filter(
      f =>
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
        !f.endsWith('.d.ts') &&
        !f.includes('node_modules') &&
        !f.startsWith('dist/'),
    )

  if (allFiles.length === 0) {
    return {
      commitHash: hash ?? commitHash,
      commitDate,
      author: author ?? '',
      message,
      files: [],
      totalScore: 0,
      averageScore: 0,
    }
  }

  // 3. Write snapshot to temp directory
  const tmpDir = path.join(os.tmpdir(), `drift-${(hash ?? commitHash).slice(0, 8)}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const relPath of allFiles) {
    try {
      const content = execGit(`git show ${commitHash}:${relPath}`, targetPath)
      const destPath = path.join(tmpDir, relPath)
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, content, 'utf-8')
    } catch { // drift-ignore
      // skip files that can't be read (binary, deleted in partial clone, etc.)
    }
  }

  // 4. Analyse the full project snapshot
  const fileReports = analyzeProject(tmpDir, config)
  const totalScore = fileReports.reduce((sum, r) => sum + r.score, 0)
  const averageScore = fileReports.length > 0 ? totalScore / fileReports.length : 0

  // 5. Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch { // drift-ignore
    // non-fatal — temp dirs are cleaned by the OS eventually
  }

  return {
    commitHash: hash ?? commitHash,
    commitDate,
    author: author ?? '',
    message,
    files: fileReports,
    totalScore,
    averageScore,
  }
}

/**
 * Run historical analysis over all commits since a given date.
 * Returns results ordered chronologically (oldest first).
 */
export async function analyzeHistoricalCommits(
  sinceDate: Date,
  targetPath: string,
  maxCommits: number,
  analyzeProject: (targetPath: string, config?: DriftConfig) => FileReport[],
  config?: DriftConfig,
  maxSamples: number = 10,
): Promise<HistoricalAnalysis[]> {
  assertGitRepo(targetPath)

  const isoDate = sinceDate.toISOString()
  const raw = execGit(
    `git log --since="${isoDate}" --format="%H" --max-count=${maxCommits}`,
    targetPath,
  )

  if (!raw) return []

  const hashes = raw.split('\n').filter(Boolean)

  // Sample: distribute evenly across the range
  const sampled = hashes.length <= maxSamples
    ? hashes
    : Array.from({ length: maxSamples }, (_, i) =>
        hashes[Math.floor(i * (hashes.length - 1) / (maxSamples - 1))]
      )

  const analyses = await Promise.all(
    sampled.map(h => analyzeSingleCommit(h, targetPath, analyzeProject, config).catch(() => null)),
  )

  return analyses
    .filter((a): a is HistoricalAnalysis => a !== null)
    .sort((a, b) => a.commitDate.getTime() - b.commitDate.getTime())
}
