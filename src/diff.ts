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

  const strictIssueKey = (i: DriftIssue) => `${i.rule}:${i.line}:${i.column}`
  const normalizedIssueKey = (i: DriftIssue) => {
    const normalizedMessage = normalizeIssueText(i.message)
    const normalizedSnippetPrefix = normalizeIssueText(i.snippet).slice(0, 80)
    return `${i.rule}:${i.severity}:${i.line}:${normalizedMessage}:${normalizedSnippetPrefix}`
  }

  const matchedBaseIndexes = new Set<number>()
  const matchedCurrentIndexes = new Set<number>()

  const baseStrictIndex = new Map<string, number[]>()
  for (const [index, issue] of baseIssues.entries()) {
    const key = strictIssueKey(issue)
    const bucket = baseStrictIndex.get(key)
    if (bucket) bucket.push(index)
    else baseStrictIndex.set(key, [index])
  }

  for (const [currentIndex, issue] of currentIssues.entries()) {
    const key = strictIssueKey(issue)
    const bucket = baseStrictIndex.get(key)
    if (!bucket || bucket.length === 0) continue

    const matchedIndex = bucket.shift()
    if (matchedIndex === undefined) continue

    matchedBaseIndexes.add(matchedIndex)
    matchedCurrentIndexes.add(currentIndex)
  }

  const baseNormalizedIndex = new Map<string, number[]>()
  for (const [index, issue] of baseIssues.entries()) {
    if (matchedBaseIndexes.has(index)) continue
    const key = normalizedIssueKey(issue)
    const bucket = baseNormalizedIndex.get(key)
    if (bucket) bucket.push(index)
    else baseNormalizedIndex.set(key, [index])
  }

  for (const [currentIndex, issue] of currentIssues.entries()) {
    if (matchedCurrentIndexes.has(currentIndex)) continue

    const key = normalizedIssueKey(issue)
    const bucket = baseNormalizedIndex.get(key)
    if (!bucket || bucket.length === 0) continue

    const matchedIndex = bucket.shift()
    if (matchedIndex === undefined) continue

    matchedBaseIndexes.add(matchedIndex)
    matchedCurrentIndexes.add(currentIndex)
  }

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
