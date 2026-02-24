import type { DriftReport, DriftDiff, FileDiff, DriftIssue } from './types.js'

/**
 * Compute the diff between two DriftReports.
 *
 * Issues are matched by (rule + line + column) as a unique key within a file.
 * A "new" issue exists in `current` but not in `base`.
 * A "resolved" issue exists in `base` but not in `current`.
 */
export function computeDiff(
  base: DriftReport,
  current: DriftReport,
  baseRef: string,
): DriftDiff {
  const fileDiffs: FileDiff[] = []

  // Build a map of base files by path for O(1) lookup
  const baseByPath = new Map(base.files.map(f => [f.path, f]))
  const currentByPath = new Map(current.files.map(f => [f.path, f]))

  // All unique paths across both reports
  const allPaths = new Set([
    ...base.files.map(f => f.path),
    ...current.files.map(f => f.path),
  ])

  for (const filePath of allPaths) {
    const baseFile = baseByPath.get(filePath)
    const currentFile = currentByPath.get(filePath)

    const scoreBefore = baseFile?.score ?? 0
    const scoreAfter = currentFile?.score ?? 0
    const scoreDelta = scoreAfter - scoreBefore

    const baseIssues = baseFile?.issues ?? []
    const currentIssues = currentFile?.issues ?? []

    // Issue identity key: rule + line + column
    const issueKey = (i: DriftIssue) => `${i.rule}:${i.line}:${i.column}`

    const baseKeys = new Set(baseIssues.map(issueKey))
    const currentKeys = new Set(currentIssues.map(issueKey))

    const newIssues = currentIssues.filter(i => !baseKeys.has(issueKey(i)))
    const resolvedIssues = baseIssues.filter(i => !currentKeys.has(issueKey(i)))

    // Only include files that have actual changes
    if (scoreDelta !== 0 || newIssues.length > 0 || resolvedIssues.length > 0) {
      fileDiffs.push({
        path: filePath,
        scoreBefore,
        scoreAfter,
        scoreDelta,
        newIssues,
        resolvedIssues,
      })
    }
  }

  // Sort: most regressed first, then most improved last
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
