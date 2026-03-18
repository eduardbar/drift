import type { DriftReport, DriftDiff, FileDiff, DriftIssue } from './types.js'

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function normalizeIssueText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

const SNIPPET_PREFIX_LENGTH = 80

interface IssueMatchState {
  matchedBaseIndexes: Set<number>
  matchedCurrentIndexes: Set<number>
}

function strictIssueKey(i: DriftIssue): string {
  return `${i.rule}:${i.line}:${i.column}`
}

function normalizedIssueKey(i: DriftIssue): string {
  const normalizedMessage = normalizeIssueText(i.message)
  const normalizedSnippetPrefix = normalizeIssueText(i.snippet).slice(0, SNIPPET_PREFIX_LENGTH)
  return `${i.rule}:${i.severity}:${i.line}:${normalizedMessage}:${normalizedSnippetPrefix}`
}

function buildIssueIndex(
  issues: DriftIssue[],
  getKey: (issue: DriftIssue) => string,
  skip?: Set<number>,
): Map<string, number[]> {
  const index = new Map<string, number[]>()
  for (const [idx, issue] of issues.entries()) {
    if (skip?.has(idx)) continue
    const key = getKey(issue)
    const bucket = index.get(key)
    if (bucket) bucket.push(idx)
    else index.set(key, [idx])
  }
  return index
}

function matchIssues(
  currentIssues: DriftIssue[],
  index: Map<string, number[]>,
  state: IssueMatchState,
  getKey: (issue: DriftIssue) => string,
): void {
  for (const [currentIndex, issue] of currentIssues.entries()) {
    if (state.matchedCurrentIndexes.has(currentIndex)) continue
    const bucket = index.get(getKey(issue))
    if (!bucket || bucket.length === 0) continue

    const matchedIndex = bucket.shift()
    if (matchedIndex === undefined) continue

    state.matchedBaseIndexes.add(matchedIndex)
    state.matchedCurrentIndexes.add(currentIndex)
  }
}

/**
 * Compute the diff between two DriftReports.
 *
 * Issues are matched in two passes:
 * 1) strict location key (rule + line + column)
 * 2) normalized content key (rule + severity + line + message + snippet)
 *
 * This keeps deterministic matching while preventing false churn caused by
 * cross-platform line ending changes and small column offset noise.
 * A "new" issue exists in `current` but not in `base`.
 * A "resolved" issue exists in `base` but not in `current`.
 */
function computeFileDiff(
  filePath: string,
  baseFile: { score: number; issues: DriftIssue[] } | undefined,
  currentFile: { score: number; issues: DriftIssue[] } | undefined,
): FileDiff | null {
  const scoreBefore = baseFile?.score ?? 0
  const scoreAfter = currentFile?.score ?? 0
  const scoreDelta = scoreAfter - scoreBefore

  const baseIssues = baseFile?.issues ?? []
  const currentIssues = currentFile?.issues ?? []

  const matchedBaseIndexes = new Set<number>()
  const matchedCurrentIndexes = new Set<number>()
  const matchState = { matchedBaseIndexes, matchedCurrentIndexes }

  const baseStrictIndex = buildIssueIndex(baseIssues, strictIssueKey)
  matchIssues(currentIssues, baseStrictIndex, matchState, strictIssueKey)

  const baseNormalizedIndex = buildIssueIndex(baseIssues, normalizedIssueKey, matchedBaseIndexes)
  matchIssues(currentIssues, baseNormalizedIndex, matchState, normalizedIssueKey)

  const newIssues = currentIssues.filter((_, index) => !matchedCurrentIndexes.has(index))
  const resolvedIssues = baseIssues.filter((_, index) => !matchedBaseIndexes.has(index))

  if (scoreDelta !== 0 || newIssues.length > 0 || resolvedIssues.length > 0) {
    return {
      path: filePath,
      scoreBefore,
      scoreAfter,
      scoreDelta,
      newIssues,
      resolvedIssues,
    }
  }

  return null
}

export function computeDiff(
  base: DriftReport,
  current: DriftReport,
  baseRef: string,
): DriftDiff {
  const fileDiffs: FileDiff[] = []

  const baseByPath = new Map(base.files.map(f => [normalizePath(f.path), f]))
  const currentByPath = new Map(current.files.map(f => [normalizePath(f.path), f]))

  const allPaths = new Set([
    ...base.files.map(f => normalizePath(f.path)),
    ...current.files.map(f => normalizePath(f.path)),
  ])

  for (const filePath of allPaths) {
    const baseFile = baseByPath.get(filePath)
    const currentFile = currentByPath.get(filePath)

    const diff = computeFileDiff(filePath, baseFile, currentFile)
    if (diff) fileDiffs.push(diff)
  }

  fileDiffs.sort((a, b) => b.scoreDelta - a.scoreDelta)

  return {
    baseRef,
    projectPath: current.targetPath,
    scannedAt: new Date().toISOString(),
    files: fileDiffs,
    totalScoreBefore: base.totalScore,
    totalScoreAfter: current.totalScore,
    totalDelta: current.totalScore - base.totalScore,
    newIssuesCount: fileDiffs.reduce((sum, f) => sum + f.newIssues.length, 0),
    resolvedIssuesCount: fileDiffs.reduce((sum, f) => sum + f.resolvedIssues.length, 0),
  }
}
