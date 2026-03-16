import type { DriftReport, DriftDiff, FileDiff, DriftIssue } from './types.js'

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/**
 * Compute the diff between two DriftReports.
 *
 * Issues are matched by (rule + line + column) as a unique key within a file.
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

  const issueKey = (i: DriftIssue) => `${i.rule}:${i.line}:${i.column}`

  const baseKeys = new Set(baseIssues.map(issueKey))
  const currentKeys = new Set(currentIssues.map(issueKey))

  const newIssues = currentIssues.filter(i => !baseKeys.has(issueKey(i)))
  const resolvedIssues = baseIssues.filter(i => !currentKeys.has(issueKey(i)))

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
