// drift-ignore-file
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { analyzeProject } from './analyzer.js'
import { buildReport } from './reporter.js'
import { FIX_SUGGESTIONS } from './reporter-constants.js'
import { extractFilesAtRef, readDiffFromBase, readStagedDiff, cleanupTempDir } from './git.js'
import type { DiffSource, AIGuardIssue, AIGuardResult, DiffHunk, GuardFileReports, UnifiedDiffEntry } from './types/ai-guard.js'
import type { DriftConfig } from './types/app.js'

const DEV_NULL = '/dev/null'
const EXCLUDED_ROOTS = new Set(['.git', 'node_modules', 'dist', 'coverage', 'out', '.atl'])

function unsafePath(path: string): never {
  throw new Error(`Unsafe diff path: '${path}' (absolute, drive-prefixed, NUL, or traversal path)`)
}

export function validateDiffPath(path: string): string | undefined {
  if (path === DEV_NULL) return undefined
  if (!path || path.includes('\0') || isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:/.test(path)) unsafePath(path)
  const stripped = path.replace(/^a[\\/]/, '').replace(/^b[\\/]/, '')
  const normalized = normalize(stripped)
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.split(/[\\/]/).includes('..')) unsafePath(path)
  return normalized.replaceAll('\\', '/')
}

function parseHeaderPath(line: string): string | undefined {
  return validateDiffPath(line.slice(4).split('\t', 1)[0])
}

function parseHunkHeader(line: string): DiffHunk {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
  if (!match) throw new Error(`Malformed unified diff hunk header: ${line}`)
  return { oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1), newStart: Number(match[3]), newCount: Number(match[4] ?? 1), lines: [] }
}

export function parseUnifiedDiff(diff: string): UnifiedDiffEntry[] {
  if (diff.includes('\0')) throw new Error('Malformed unified diff: NUL byte')
  if (!diff.trim()) return []
  const entries: UnifiedDiffEntry[] = []
  let current: UnifiedDiffEntry | undefined
  let hunk: DiffHunk | undefined
  const finish = () => { if (current) entries.push(current); current = undefined; hunk = undefined }

  for (const line of diff.replaceAll('\r\n', '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish()
      const header = line.slice(11).match(/^(\S+)\s+(\S+)$/)
      if (!header) throw new Error(`Malformed unified diff file header: ${line}`)
      current = { status: 'modified', oldPath: validateDiffPath(header[1]), newPath: validateDiffPath(header[2]), hunks: [] }
      continue
    }
    if (!current && line.startsWith('--- ')) current = { status: 'modified', hunks: [] }
    if (!current) continue
    if (line.startsWith('rename from ')) { current.oldPath = validateDiffPath(line.slice(12).trim()); current.status = 'rename'; continue }
    if (line.startsWith('rename to ')) { current.newPath = validateDiffPath(line.slice(10).trim()); current.status = 'rename'; continue }
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') { current.status = 'binary'; continue }
    if (line.startsWith('new file mode ')) { current.status = 'added'; continue }
    if (line.startsWith('deleted file mode ')) { current.status = 'deleted'; continue }
    if (line.startsWith('--- ')) { current.oldPath = parseHeaderPath(line); continue }
    if (line.startsWith('+++ ')) { current.newPath = parseHeaderPath(line); continue }
    if (line.startsWith('@@ ')) { hunk = parseHunkHeader(line); current.hunks.push(hunk); continue }
    if (hunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\'))) { hunk.lines.push(line); continue }
    if (line.trim() && !/^(index |similarity index |old mode |new mode |diff --git )/.test(line)) throw new Error(`Malformed unified diff line: ${line}`)
  }
  finish()
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

/** Validate every existing ancestor. This rejects symlinks and Windows junctions before mutation. */
function safeMutationPath(root: string, target: string, operation: string): string {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  if (!isWithin(rootPath, targetPath)) unsafePath(target)
  const rootReal = realpathSync.native(rootPath)
  const pathExists = (candidate: string) => { try { lstatSync(candidate); return true } catch { return false } }
  let current = targetPath
  const missing: string[] = []
  while (!pathExists(current)) {
    missing.unshift(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
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
  return targetPath
}

function applyHunks(filePath: string, hunks: DiffHunk[]): string {
  const source = existsSync(filePath) ? readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n') : []
  if (source.at(-1) === '') source.pop()
  let offset = 0
  for (const hunk of hunks) {
    const start = Math.max(0, hunk.oldStart - 1 + offset)
    const oldLines: string[] = []
    const additions: string[] = []
    for (const line of hunk.lines) {
      if (line.startsWith('\\')) continue
      if (line[0] === ' ' || line[0] === '-') oldLines.push(line.slice(1))
      if (line[0] === ' ' || line[0] === '+') additions.push(line.slice(1))
    }
    if (source.slice(start, start + oldLines.length).join('\n') !== oldLines.join('\n')) throw new Error(`Patch context does not match '${filePath}'`)
    source.splice(start, oldLines.length, ...additions)
    offset += additions.length - oldLines.length
  }
  return source.join('\n') + '\n'
}

export function applyDiffToTempDir(tempDir: string, entries: UnifiedDiffEntry[]): void {
  const root = resolve(tempDir)
  mkdirSync(root, { recursive: true })
  safeMutationPath(root, root, 'write')
  for (const entry of entries) {
    const oldPath = entry.oldPath ? safeMutationPath(root, resolve(root, entry.oldPath), entry.status === 'rename' || entry.status === 'deleted' ? 'delete' : 'read') : undefined
    const newPath = entry.newPath ? safeMutationPath(root, resolve(root, entry.newPath), entry.status === 'rename' ? 'write' : 'write') : undefined
    if (entry.status === 'binary') continue
    if (entry.status === 'rename') {
      if (!oldPath || !newPath) throw new Error('Malformed rename: both paths are required')
      if (!existsSync(oldPath)) throw new Error(`Cannot rename missing file '${entry.oldPath}'`)
      mkdirSync(dirname(newPath), { recursive: true })
      safeMutationPath(root, newPath, 'write')
      if (resolve(oldPath) !== resolve(newPath)) {
        if (existsSync(newPath)) rmSync(safeMutationPath(root, newPath, 'delete'), { force: true })
        cpSync(oldPath, newPath)
        rmSync(safeMutationPath(root, oldPath, 'delete'), { force: true })
      }
      if (entry.hunks.length > 0) writeFileSync(safeMutationPath(root, newPath, 'write'), applyHunks(newPath, entry.hunks), 'utf8')
      continue
    }
    if (entry.status === 'deleted') { if (oldPath && existsSync(oldPath)) rmSync(safeMutationPath(root, oldPath, 'delete'), { force: true }); continue }
    if (!newPath) throw new Error('Malformed diff: missing destination path')
    mkdirSync(dirname(newPath), { recursive: true })
    writeFileSync(safeMutationPath(root, newPath, 'write'), applyHunks(newPath, entry.hunks), 'utf8')
  }
}

function relativeIssuePath(root: string, file: string | undefined): string | undefined {
  if (!file) return undefined
  const candidate = isAbsolute(file) ? relative(root, file) : file
  return candidate.replaceAll('\\', '/').replace(/^\.\//, '')
}

function flatten(reports: GuardFileReports, root: string): AIGuardIssue[] {
  return reports.flatMap(file => file.issues.map(issue => ({ ...issue, file: relativeIssuePath(root, file.path) })))
}

function issueKey(issue: AIGuardIssue): string { return `${issue.file ?? ''}|${issue.rule}|${issue.message ?? ''}` }
function sortIssues(issues: AIGuardIssue[]): AIGuardIssue[] { return [...issues].sort((a, b) => issueKey(a).localeCompare(issueKey(b)) || (a.line ?? 0) - (b.line ?? 0)) }

export function computeAIGuardResult(before: GuardFileReports, after: GuardFileReports, roots: { before?: string; after?: string } = {}): Pick<AIGuardResult, 'scoreBefore' | 'scoreAfter' | 'scoreDelta' | 'newIssues' | 'resolvedIssues' | 'issues'> {
  const beforeIssues = sortIssues(flatten(before, roots.before ?? ''))
  const afterIssues = sortIssues(flatten(after, roots.after ?? ''))
  const beforeKeys = new Set(beforeIssues.map(issueKey))
  const afterKeys = new Set(afterIssues.map(issueKey))
  const score = (files: GuardFileReports) => files.length ? Math.round(files.reduce((sum, file) => sum + file.score, 0) / files.length) : 100
  const scoreBefore = score(before)
  const scoreAfter = score(after)
  return { scoreBefore, scoreAfter, scoreDelta: scoreAfter - scoreBefore, newIssues: afterIssues.filter(issue => !beforeKeys.has(issueKey(issue))), resolvedIssues: beforeIssues.filter(issue => !afterKeys.has(issueKey(issue))), issues: afterIssues }
}

export function enforceBudget(scoreDelta: number, budget = 0): { passed: boolean; reason?: string } { return scoreDelta <= budget ? { passed: true, reason: undefined } : { passed: false, reason: `score delta ${scoreDelta} exceeds budget ${budget}` } }
export function enforceBlockOn(issues: Array<Pick<AIGuardIssue, 'rule' | 'severity'>>, blockOn: string[] = []): { passed: boolean; reason?: string } {
  const blocked = issues.find(issue => blockOn.includes(issue.rule) || blockOn.includes(issue.severity))
  return blocked ? { passed: false, reason: `blocked by ${blocked.rule} (${blocked.severity})` } : { passed: true, reason: undefined }
}

export function selectDiffSource(options: { stdin?: boolean; staged?: boolean; file?: string; base?: string }, stdinContent = ''): DiffSource {
  const selected = [options.stdin, options.staged, options.file != null, options.base != null].filter(Boolean).length
  if (selected !== 1) throw new Error('ai-guard requires exactly one diff source: --stdin, --staged, --file, or --base')
  if (options.stdin) return { kind: 'stdin', content: stdinContent }
  if (options.staged) return { kind: 'staged' }
  if (options.file != null) return { kind: 'file', path: options.file }
  return { kind: 'base', ref: options.base as string }
}

function sourceDiff(projectPath: string, source: DiffSource): string {
  if (source.kind === 'stdin') return source.content
  if (source.kind === 'staged') return readStagedDiff(projectPath)
  if (source.kind === 'base') return readDiffFromBase(projectPath, source.ref)
  if (isAbsolute(source.path) || source.path.includes('\0')) throw new Error('Diff file path must be relative and NUL-free')
  return readFileSync(safeMutationPath(resolve(projectPath), resolve(projectPath, source.path), 'read'), 'utf8')
}

function copyProject(projectPath: string, destination: string): void {
  const sourceRoot = resolve(projectPath)
  const copy = (source: string, target: string) => {
    const stat = lstatSync(source)
    if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symlink or junction: '${source}'`)
    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true })
      for (const entry of readdirSync(source)) {
        if (EXCLUDED_ROOTS.has(entry) || entry.startsWith('drift-ai-guard-') || entry.startsWith('drift-diff-')) continue
        copy(join(source, entry), join(target, entry))
      }
    } else cpSync(source, target)
  }
  copy(sourceRoot, destination)
}

function prepareBaseline(projectPath: string, source: DiffSource, root: string): { before: string; cleanup: () => void } {
  if (source.kind === 'staged') {
    const before = extractFilesAtRef(projectPath, 'HEAD')
    return { before, cleanup: () => cleanupTempDir(before) }
  }
  if (source.kind === 'base') {
    const before = extractFilesAtRef(projectPath, source.ref)
    return { before, cleanup: () => cleanupTempDir(before) }
  }
  const before = join(root, 'before')
  copyProject(projectPath, before)
  return { before, cleanup: () => undefined }
}

export async function runAIGuard(options: { projectPath: string; source: DiffSource; budget?: number; blockOn?: string[]; suggestions?: boolean; analysisOptions?: any; config?: DriftConfig }): Promise<AIGuardResult> {
  const root = mkdtempSync(join(tmpdir(), `drift-ai-guard-${randomUUID()}-`))
  let signal: NodeJS.Signals | undefined
  const cleanupRoot = () => { try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }) } catch { /* best effort; no fallback process kill */ } }
  const onSignal = (name: NodeJS.Signals) => { signal = name; cleanupRoot(); process.exitCode = name === 'SIGINT' ? 130 : 143 }
  const onInt = () => onSignal('SIGINT')
  const onTerm = () => onSignal('SIGTERM')
  process.once('SIGINT', onInt); process.once('SIGTERM', onTerm)
  let baselineCleanup: () => void = () => undefined
  try {
    const diff = sourceDiff(options.projectPath, options.source)
    if (!diff.trim()) throw new Error('The selected diff source is empty')
    const entries = parseUnifiedDiff(diff)
    const prepared = prepareBaseline(options.projectPath, options.source, root)
    baselineCleanup = prepared.cleanup
    const afterPath = join(root, 'after')
    copyProject(prepared.before, afterPath)
    applyDiffToTempDir(afterPath, entries)
    const beforeReport = buildReport(prepared.before, analyzeProject(prepared.before, options.config, options.analysisOptions))
    const afterReport = buildReport(afterPath, analyzeProject(afterPath, options.config, options.analysisOptions))
    const delta = computeAIGuardResult(beforeReport.files, afterReport.files, { before: prepared.before, after: afterPath })
    const budget = enforceBudget(delta.scoreDelta, options.budget ?? 0)
    const block = enforceBlockOn(delta.newIssues, options.blockOn ?? [])
    const files = [...new Set(entries.flatMap(entry => [entry.oldPath, entry.newPath].filter((path): path is string => Boolean(path))))].sort()
    const result: AIGuardResult = { ...delta, passed: budget.passed && block.passed, source: options.source.kind, files, reason: budget.reason ?? block.reason }
    if (options.suggestions) result.suggestions = delta.newIssues.map(issue => ({ ...issue, suggestion: FIX_SUGGESTIONS[issue.rule] ?? 'Review and fix this issue' }))
    if (signal) result.reason = `interrupted by ${signal}`
    return result
  } finally {
    baselineCleanup()
    process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm)
    cleanupRoot()
  }
}

export function formatAIGuardJson(result: AIGuardResult): string { return JSON.stringify(result, null, 2) }
export function formatAIGuardHuman(result: AIGuardResult): string {
  const lines = [`AI guard: ${result.passed ? 'PASS' : 'FAIL'}`, `Score: ${result.scoreBefore} -> ${result.scoreAfter} (${result.scoreDelta >= 0 ? '+' : ''}${result.scoreDelta})`, `New issues: ${result.newIssues.length}`, `Resolved issues: ${result.resolvedIssues.length}`]
  if (result.reason) lines.push(`Reason: ${result.reason}`)
  if (result.suggestions?.length) for (const suggestion of result.suggestions) lines.push(`Suggestion [${suggestion.rule}] ${suggestion.file ?? ''}: ${suggestion.suggestion}`)
  return lines.join('\n')
}
