import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { extractFilesAtRef, readDiffFromBase, readStagedDiff, cleanupTempDir } from './git.js'
import { applyDiffToTempDir, readDiffFile } from './ai-guard-diff.js'
import type { DiffSource } from './types/ai-guard.js'

const EXCLUDED_ROOTS = new Set(['.git', 'node_modules', 'dist', 'coverage', 'out', '.atl', '.drift', '.drift-perf', '.drift-smoke'])
const GENERATED_ROOT_PREFIXES = ['drift-ai-guard-', 'drift-diff-']
const TEMP_ROOT_PREFIX = 'drift-ai-guard-'

export function createAIGuardRoot(): string {
  return mkdtempSync(join(tmpdir(), `${TEMP_ROOT_PREFIX}${randomUUID()}-`))
}

function shouldCopy(name: string): boolean {
  return !EXCLUDED_ROOTS.has(name) && !GENERATED_ROOT_PREFIXES.some(prefix => name.startsWith(prefix))
}

function copyProject(sourceRoot: string, destination: string): void {
  const sourceStat = lstatSync(sourceRoot)
  if (sourceStat.isSymbolicLink()) throw new Error(`Refusing to copy symlink or junction: '${sourceRoot}'`)
  if (!sourceStat.isDirectory()) { cpSync(sourceRoot, destination); return }
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(sourceRoot)) {
    if (shouldCopy(entry)) copyProject(join(sourceRoot, entry), join(destination, entry))
  }
}

export function readSelectedDiff(projectPath: string, source: DiffSource): string {
  if (source.kind === 'stdin') return source.content
  if (source.kind === 'staged') return readStagedDiff(projectPath)
  if (source.kind === 'base') return readDiffFromBase(projectPath, source.ref)
  if (isAbsolute(source.path) || source.path.includes('\0')) throw new Error('Diff file path must be relative and NUL-free')
  const projectRoot = resolve(projectPath)
  const candidate = resolve(projectRoot, source.path)
  const relativePath = relative(projectRoot, candidate)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new Error(`Diff file is outside project: '${source.path}'`)
  return readDiffFile(projectRoot, source.path)
}

export function prepareBaseline(projectPath: string, source: DiffSource, root: string): { before: string; cleanup: () => void } {
  if (source.kind === 'staged') {
    const before = extractFilesAtRef(projectPath, 'HEAD')
    return { before, cleanup: () => cleanupTempDir(before) }
  }
  if (source.kind === 'base') {
    const before = extractFilesAtRef(projectPath, source.ref)
    return { before, cleanup: () => cleanupTempDir(before) }
  }
  const before = join(root, 'before')
  copyProject(resolve(projectPath), before)
  return { before, cleanup: () => undefined }
}

export function materializeAfter(before: string, after: string, entries: Parameters<typeof applyDiffToTempDir>[1]): void {
  copyProject(before, after)
  applyDiffToTempDir(after, entries)
}
