import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, normalize, relative, resolve, sep, win32 } from 'node:path'
import type { DiffHunk, UnifiedDiffEntry } from './types/ai-guard.js'

const PATH_SEPARATOR = '/'
const NULL_DIFF_PATH = [PATH_SEPARATOR, 'dev', 'null'].join(PATH_SEPARATOR)
const DIFF_HEADER_PREFIX = 'diff --git '
const DIFF_PATH_PREFIX_LENGTH = DIFF_HEADER_PREFIX.length
const PATCH_PREFIX_LENGTH = 4
const RENAME_FROM_PREFIX_LENGTH = 12
const RENAME_TO_PREFIX_LENGTH = 10
const FIRST_LINE_INDEX = 0
const ONE_LINE = 1
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const OLD_START_CAPTURE = 1
const OLD_COUNT_CAPTURE = 2
const NEW_START_CAPTURE = 3
const NEW_COUNT_CAPTURE = 4

function unsafePath(path: string): never {
  throw new Error(`Unsafe diff path: '${path}' (absolute, drive-prefixed, NUL, or traversal path)`)
}

function validateDiffPath(path: string): string | undefined {
  if (path === NULL_DIFF_PATH) return undefined
  if (!path || path.includes('\0') || isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:/.test(path)) unsafePath(path)
  const stripped = path.replace(/^a[\\/]/, '').replace(/^b[\\/]/, '')
  const normalized = normalize(stripped)
  const segments = normalized.split(/[\\/]/)
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || segments.includes('..')) unsafePath(path)
  return normalized.replaceAll('\\', PATH_SEPARATOR)
}

function parseHeaderPath(line: string): string | undefined {
  return validateDiffPath(line.slice(PATCH_PREFIX_LENGTH).split('\t', ONE_LINE)[FIRST_LINE_INDEX])
}

function parseHunkHeader(line: string): DiffHunk {
  const match = line.match(HUNK_HEADER_PATTERN)
  if (!match) throw new Error(`Malformed unified diff hunk header: ${line}`)
  return {
    oldStart: Number(match[OLD_START_CAPTURE]),
    oldCount: Number(match[OLD_COUNT_CAPTURE] ?? ONE_LINE),
    newStart: Number(match[NEW_START_CAPTURE]),
    newCount: Number(match[NEW_COUNT_CAPTURE] ?? ONE_LINE),
    lines: [],
  }
}

interface DiffParserState {
  current: UnifiedDiffEntry | undefined
  hunk: DiffHunk | undefined
}

function beginEntry(line: string, state: DiffParserState): boolean {
  if (!line.startsWith(DIFF_HEADER_PREFIX)) return false
  const header = line.slice(DIFF_PATH_PREFIX_LENGTH).match(/^(\S+)\s+(\S+)$/)
  if (!header) throw new Error(`Malformed unified diff file header: ${line}`)
  state.current = { status: 'modified', oldPath: validateDiffPath(header[1]), newPath: validateDiffPath(header[2]), hunks: [] }
  state.hunk = undefined
  return true
}

function updateMetadata(line: string, state: DiffParserState): boolean {
  if (!state.current) return false
  const metadata: Array<{ prefix: string; pathOffset: number; status: UnifiedDiffEntry['status']; field: 'oldPath' | 'newPath' }> = [
    { prefix: 'rename from ', pathOffset: RENAME_FROM_PREFIX_LENGTH, status: 'rename', field: 'oldPath' },
    { prefix: 'rename to ', pathOffset: RENAME_TO_PREFIX_LENGTH, status: 'rename', field: 'newPath' },
  ]
  const match = metadata.find(item => line.startsWith(item.prefix))
  if (match) { state.current[match.field] = validateDiffPath(line.slice(match.pathOffset).trim()); state.current.status = match.status; return true }
  if (line.startsWith('Binary files ') || line === 'GIT binary patch') { state.current.status = 'binary'; return true }
  if (line.startsWith('new file mode ')) { state.current.status = 'added'; return true }
  if (line.startsWith('deleted file mode ')) { state.current.status = 'deleted'; return true }
  if (line.startsWith('--- ')) { state.current.oldPath = parseHeaderPath(line); return true }
  if (line.startsWith('+++ ')) { state.current.newPath = parseHeaderPath(line); return true }
  return false
}

function updateHunk(line: string, state: DiffParserState): boolean {
  if (!state.current) return false
  if (line.startsWith('@@ ')) { state.hunk = parseHunkHeader(line); state.current.hunks.push(state.hunk); return true }
  if (state.hunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\'))) { state.hunk.lines.push(line); return true }
  return false
}

function consumeDiffLine(line: string, state: DiffParserState): void {
  if (beginEntry(line, state)) return
  if (!state.current && line.startsWith('--- ')) state.current = { status: 'modified', hunks: [] }
  if (updateMetadata(line, state) || updateHunk(line, state)) return
  if (line.trim() && !/^(index |similarity index |old mode |new mode |diff --git )/.test(line)) throw new Error(`Malformed unified diff line: ${line}`)
}

function finishEntry(entries: UnifiedDiffEntry[], state: DiffParserState): void {
  if (state.current) entries.push(state.current)
  state.current = undefined
  state.hunk = undefined
}

function parseDiffLines(diff: string, entries: UnifiedDiffEntry[]): void {
  const state: DiffParserState = { current: undefined, hunk: undefined }
  for (const line of diff.replaceAll('\r\n', '\n').split('\n')) {
    if (line.startsWith(DIFF_HEADER_PREFIX)) {
      finishEntry(entries, state)
      beginEntry(line, state)
    } else if (state.current || line.startsWith('--- ')) {
      consumeDiffLine(line, state)
    }
  }
  finishEntry(entries, state)
}

export function parseUnifiedDiff(diff: string): UnifiedDiffEntry[] {
  if (diff.includes('\0')) throw new Error('Malformed unified diff: NUL byte')
  if (!diff.trim()) return []
  const entries: UnifiedDiffEntry[] = []
  parseDiffLines(diff, entries)
  if (entries.length === 0 || entries.some(entry => !entry.oldPath && !entry.newPath)) throw new Error('Malformed unified diff: missing file paths')
  return entries
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function canonicalComparable(path: string): string {
  const value = normalize(path)
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function pathExists(candidate: string): boolean {
  try {
    lstatSync(candidate)
    return true
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function existingAncestor(targetPath: string): { current: string; missing: string[] } {
  let current = targetPath
  const missing: string[] = []
  while (!pathExists(current)) {
    missing.unshift(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return { current, missing }
}

interface MutationValidationContext {
  rootPath: string
  rootReal: string
  current: string
  missing: string[]
  target: string
  operation: string
}

function validateMutationCandidates(context: MutationValidationContext): void {
  const { rootPath, rootReal, current, missing, target, operation } = context
  if (!isWithin(rootPath, current)) unsafePath(target)
  for (const candidate of [current, ...missing]) {
    if (!pathExists(candidate)) continue
    const stat = lstatSync(candidate)
    if (stat.isSymbolicLink()) throw new Error(`Refusing ${operation} through symlink or junction: '${candidate}'`)
    const real = realpathSync.native(candidate)
    if (!isWithin(rootReal, real) || (canonicalComparable(real) !== canonicalComparable(candidate) && candidate !== rootPath)) {
      throw new Error(`Refusing ${operation} through symlink or junction: '${candidate}'`)
    }
  }
}

function safeMutationPath(root: string, target: string, operation: string): string {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  if (!isWithin(rootPath, targetPath)) unsafePath(target)
  const rootReal = realpathSync.native(rootPath)
  const ancestor = existingAncestor(targetPath)
  validateMutationCandidates({ rootPath, rootReal, current: ancestor.current, missing: ancestor.missing, target, operation })
  return targetPath
}

function patchLines(hunk: DiffHunk): { oldLines: string[]; additions: string[] } {
  const oldLines: string[] = []
  const additions: string[] = []
  for (const line of hunk.lines) {
    if (line.startsWith('\\')) continue
    if (line[FIRST_LINE_INDEX] === ' ' || line[FIRST_LINE_INDEX] === '-') oldLines.push(line.slice(ONE_LINE))
    if (line[FIRST_LINE_INDEX] === ' ' || line[FIRST_LINE_INDEX] === '+') additions.push(line.slice(ONE_LINE))
  }
  return { oldLines, additions }
}

function applyHunk(source: string[], hunk: DiffHunk, offset: number, filePath: string): number {
  const start = Math.max(0, hunk.oldStart - ONE_LINE + offset)
  const { oldLines, additions } = patchLines(hunk)
  if (source.slice(start, start + oldLines.length).join('\n') !== oldLines.join('\n')) throw new Error(`Patch context does not match '${filePath}'`)
  source.splice(start, oldLines.length, ...additions)
  return additions.length - oldLines.length
}

function applyHunks(filePath: string, hunks: DiffHunk[]): string {
  const source = existsSync(filePath) ? readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n') : []
  if (source.at(-ONE_LINE) === '') source.pop()
  let offset = 0
  for (const hunk of hunks) offset += applyHunk(source, hunk, offset, filePath)
  return source.join('\n') + '\n'
}

interface MutationPaths {
  oldPath: string | undefined
  newPath: string | undefined
}

function mutationPaths(root: string, entry: UnifiedDiffEntry): MutationPaths {
  return {
    oldPath: entry.oldPath ? safeMutationPath(root, resolve(root, entry.oldPath), entry.status === 'rename' || entry.status === 'deleted' ? 'delete' : 'read') : undefined,
    newPath: entry.newPath ? safeMutationPath(root, resolve(root, entry.newPath), 'write') : undefined,
  }
}

function applyRename(root: string, entry: UnifiedDiffEntry, paths: MutationPaths): void {
  const { oldPath, newPath } = paths
  if (!oldPath || !newPath) throw new Error('Malformed rename: both paths are required')
  if (!existsSync(oldPath)) throw new Error(`Cannot rename missing file '${entry.oldPath}'`)
  mkdirSync(dirname(newPath), { recursive: true })
  if (resolve(oldPath) !== resolve(newPath)) {
    if (existsSync(newPath)) rmSync(safeMutationPath(root, newPath, 'delete'), { force: true })
    cpSync(oldPath, newPath)
    rmSync(safeMutationPath(root, oldPath, 'delete'), { force: true })
  }
  if (entry.hunks.length > 0) writeFileSync(safeMutationPath(root, newPath, 'write'), applyHunks(newPath, entry.hunks), 'utf8')
}

function applyEntry(root: string, entry: UnifiedDiffEntry): void {
  const paths = mutationPaths(root, entry)
  if (entry.status === 'binary') return
  if (entry.status === 'rename') {
    applyRename(root, entry, paths)
    return
  }
  if (entry.status === 'deleted') {
    if (paths.oldPath && existsSync(paths.oldPath)) rmSync(safeMutationPath(root, paths.oldPath, 'delete'), { force: true })
    return
  }
  if (!paths.newPath) throw new Error('Malformed diff: missing destination path')
  mkdirSync(dirname(paths.newPath), { recursive: true })
  writeFileSync(safeMutationPath(root, paths.newPath, 'write'), applyHunks(paths.newPath, entry.hunks), 'utf8')
}

export function applyDiffToTempDir(tempDir: string, entries: UnifiedDiffEntry[]): void {
  const root = resolve(tempDir)
  mkdirSync(root, { recursive: true })
  safeMutationPath(root, root, 'write')
  for (const entry of entries) applyEntry(root, entry)
}

export function readDiffFile(projectRoot: string, filePath: string): string {
  if (isAbsolute(filePath) || filePath.includes('\0')) throw new Error('Diff file path must be relative and NUL-free')
  const root = resolve(projectRoot)
  const candidate = safeMutationPath(root, resolve(root, filePath), 'read')
  return readFileSync(candidate, 'utf8')
}
