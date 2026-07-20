// drift-ignore-file
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { analyzeProject } from './analyzer.js'
import { buildReport, formatAIOutput } from './reporter.js'
import { readDiffFromBase, readStagedDiff } from './git.js'
import type { DiffSource, AIGuardIssue, AIGuardResult, DiffHunk, GuardFileReports, UnifiedDiffEntry } from './types/ai-guard.js'
import type { DriftConfig } from './types/app.js'
import type { DriftIssue, FileReport } from './types/core.js'

const DEV_NULL = '/dev/null'

function unsafePath(path: string): never {
  throw new Error(`Unsafe diff path: '${path}' (absolute, drive-prefixed, NUL, or traversal path)`)
}

export function validateDiffPath(path: string): string | undefined {
  if (path === DEV_NULL) return undefined
  if (!path || path.includes('\0') || isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:/.test(path)) unsafePath(path)
  const normalized = normalize(path.replace(/^a\//, '').replace(/^b\//, ''))
  if (normalized === '..' || normalized.startsWith(`..${normalize('/')}`) || normalized.includes(`${normalize('/') }..${normalize('/')}`)) unsafePath(path)
  if (normalized.split(/[\\/]/).includes('..')) unsafePath(path)
  return normalized.replaceAll('\\', '/')
}

function parseHeaderPath(line: string): string | undefined {
  const value = line.slice(4).split('\t', 1)[0]
  return validateDiffPath(value)
}

function parseHunkHeader(line: string): DiffHunk {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
  if (!match) throw new Error(`Malformed unified diff hunk header: ${line}`)
  return { oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1), newStart: Number(match[3]), newCount: Number(match[4] ?? 1), lines: [] }
}

export function parseUnifiedDiff(diff: string): UnifiedDiffEntry[] {
  if (diff.includes('\0')) throw new Error('Malformed unified diff: NUL byte')
  if (!diff.trim()) return []
  const lines = diff.replaceAll('\r\n', '\n').split('\n')
  const entries: UnifiedDiffEntry[] = []
  let current: UnifiedDiffEntry | undefined
  let hunk: DiffHunk | undefined
  let sawFile = false

  const finish = () => { if (current) entries.push(current); current = undefined; hunk = undefined }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      finish()
      const header = line.slice(11).match(/^(\S+)\s+(\S+)$/)
      if (!header) throw new Error(`Malformed unified diff file header: ${line}`)
      current = { status: 'modified', oldPath: validateDiffPath(header[1]), newPath: validateDiffPath(header[2]), hunks: [] }
      sawFile = true
      continue
    }
    if (!current && line.startsWith('--- ')) { current = { status: 'modified', hunks: [] }; sawFile = true }
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
    if (line.trim() && !line.startsWith('index ') && !line.startsWith('similarity index ') && !line.startsWith('old mode ') && !line.startsWith('new mode ')) {
      if (!line.startsWith('diff --git ')) throw new Error(`Malformed unified diff line: ${line}`)
    }
  }
  finish()
  if (!sawFile || entries.some(entry => !entry.oldPath && !entry.newPath)) throw new Error('Malformed unified diff: missing file paths')
  return entries
}

function containedPath(root: string, path: string): string {
  const rootResolved = resolve(root)
  const target = resolve(rootResolved, path)
  const rel = relative(rootResolved, target)
  if (rel === '..' || rel.startsWith(`..${normalize('/')}`) || isAbsolute(rel)) unsafePath(path)
  return target
}

function applyHunks(filePath: string, hunks: DiffHunk[]): string {
  const source = existsSync(filePath) ? readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n') : []
  if (source.length && source[source.length - 1] === '') source.pop()
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
  for (const entry of entries) {
    const oldPath = entry.oldPath ? containedPath(root, entry.oldPath) : undefined
    const newPath = entry.newPath ? containedPath(root, entry.newPath) : undefined
    if (entry.status === 'binary') continue
    if (entry.status === 'rename') {
      if (!oldPath || !newPath) throw new Error('Malformed rename: both paths are required')
      mkdirSync(dirname(newPath), { recursive: true })
      if (!existsSync(oldPath)) throw new Error(`Cannot rename missing file '${entry.oldPath}'`)
      if (resolve(oldPath) === resolve(newPath)) continue
      rmSync(newPath, { force: true })
      // renameSync is intentionally avoided for cross-device safety; copy then delete is still contained.
      cpSync(oldPath, newPath)
      rmSync(oldPath, { force: true })
      if (entry.hunks.length > 0) writeFileSync(newPath, applyHunks(newPath, entry.hunks), 'utf8')
      continue
    }
    if (entry.status === 'deleted') { if (oldPath) rmSync(oldPath, { force: true }); continue }
    if (!newPath) throw new Error('Malformed diff: missing destination path')
    mkdirSync(dirname(newPath), { recursive: true })
    writeFileSync(newPath, applyHunks(newPath, entry.hunks), 'utf8')
  }
}

function issueKey(issue: AIGuardIssue): string { return `${issue.file ?? ''}|${issue.rule}|${issue.line ?? 0}|${issue.message ?? ''}` }
function flatten(reports: GuardFileReports): AIGuardIssue[] {
  return reports.flatMap(file => file.issues.map(issue => ({ ...issue, file: file.path })))
}

export function computeAIGuardResult(before: GuardFileReports, after: GuardFileReports): Pick<AIGuardResult, 'scoreBefore' | 'scoreAfter' | 'scoreDelta' | 'newIssues' | 'resolvedIssues' | 'issues'> {
  const beforeIssues = flatten(before)
  const afterIssues = flatten(after)
  const beforeKeys = new Set(beforeIssues.map(issueKey))
  const afterKeys = new Set(afterIssues.map(issueKey))
  return {
    scoreBefore: before.length ? Math.round(before.reduce((sum, file) => sum + file.score, 0) / before.length) : 100,
    scoreAfter: after.length ? Math.round(after.reduce((sum, file) => sum + file.score, 0) / after.length) : 100,
    scoreDelta: (after.length ? Math.round(after.reduce((sum, file) => sum + file.score, 0) / after.length) : 100) - (before.length ? Math.round(before.reduce((sum, file) => sum + file.score, 0) / before.length) : 100),
    newIssues: afterIssues.filter(issue => !beforeKeys.has(issueKey(issue))),
    resolvedIssues: beforeIssues.filter(issue => !afterKeys.has(issueKey(issue))),
    issues: afterIssues,
  }
}

export function enforceBudget(scoreDelta: number, budget = 0): { passed: boolean; reason?: string } {
  return scoreDelta <= budget ? { passed: true, reason: undefined } : { passed: false, reason: `score delta ${scoreDelta} exceeds budget ${budget}` }
}

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
  return readFileSync(containedPath(resolve(projectPath), source.path), 'utf8')
}

function copyProject(projectPath: string, destination: string): void {
  cpSync(projectPath, destination, { recursive: true, filter: source => !source.includes(`${normalize('/')}node_modules${normalize('/')}`) && !source.includes(`${normalize('/')}\.git${normalize('/')}`) })
}

export async function runAIGuard(options: { projectPath: string; source: DiffSource; budget?: number; blockOn?: string[]; suggestions?: boolean; analysisOptions?: any; config?: DriftConfig }): Promise<AIGuardResult> {
  const root = mkdtempSync(join(tmpdir(), `drift-ai-guard-${randomUUID()}-`))
  let stopping = false
  const cleanup = () => { if (!stopping) { stopping = true; rmSync(root, { recursive: true, force: true }) } }
  const onSignal = () => { cleanup(); process.exit(130) }
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal)
  try {
    const diff = sourceDiff(options.projectPath, options.source)
    if (!diff.trim()) throw new Error('The selected diff source is empty')
    const entries = parseUnifiedDiff(diff)
    const beforePath = join(root, 'before')
    const afterPath = join(root, 'after')
    copyProject(options.projectPath, beforePath)
    copyProject(options.projectPath, afterPath)
    applyDiffToTempDir(afterPath, entries)
    const beforeReport = buildReport(beforePath, analyzeProject(beforePath, options.config, options.analysisOptions))
    const afterReport = buildReport(afterPath, analyzeProject(afterPath, options.config, options.analysisOptions))
    const delta = computeAIGuardResult(beforeReport.files, afterReport.files)
    const budget = enforceBudget(delta.scoreDelta, options.budget ?? 0)
    const block = enforceBlockOn(delta.newIssues, options.blockOn ?? [])
    return { ...delta, passed: budget.passed && block.passed, source: options.source.kind, files: entries.flatMap(entry => [entry.oldPath, entry.newPath].filter((path): path is string => Boolean(path))), reason: budget.reason ?? block.reason }
  } finally {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); cleanup()
  }
}

export function formatAIGuardJson(result: AIGuardResult): string { return JSON.stringify(result, null, 2) }
export function formatAIGuardHuman(result: AIGuardResult): string {
  const lines = [`AI guard: ${result.passed ? 'PASS' : 'FAIL'}`, `Score: ${result.scoreBefore} -> ${result.scoreAfter} (${result.scoreDelta >= 0 ? '+' : ''}${result.scoreDelta})`, `New issues: ${result.newIssues.length}`, `Resolved issues: ${result.resolvedIssues.length}`]
  if (result.reason) lines.push(`Reason: ${result.reason}`)
  return lines.join('\n')
}
