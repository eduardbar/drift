import { relative, resolve } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { loadConfig } from './config.js'
import { buildReport } from './reporter.js'
import { cleanupTempDir, extractFilesAtRef } from './git.js'
import { computeDiff } from './diff.js'
import type { DriftDiff } from './types.js'

interface DriftReview {
  baseRef: string
  scannedAt: string
  totalDelta: number
  newIssues: number
  resolvedIssues: number
  status: 'clean' | 'improved' | 'regressed'
  summary: string
  markdown: string
  diff: DriftDiff
}

const REVIEW_TOP_FILES_LIMIT = 8

export function formatReviewMarkdown(review: DriftReview): string {
  const trendIcon = review.status === 'regressed' ? '⚠️' : review.status === 'improved' ? '✅' : 'ℹ️'
  const topFiles = review.diff.files
    .slice(0, REVIEW_TOP_FILES_LIMIT)
    .map((file) => {
      const sign = file.scoreDelta > 0 ? '+' : ''
      return `- \`${file.path}\`: ${file.scoreBefore} -> ${file.scoreAfter} (${sign}${file.scoreDelta}), +${file.newIssues.length} new / -${file.resolvedIssues.length} resolved`
    })
    .join('\n')

  return [
    '## drift review',
    '',
    `${trendIcon} ${review.summary}`,
    '',
    `- Base ref: \`${review.baseRef}\``,
    `- Score delta: **${review.totalDelta >= 0 ? '+' : ''}${review.totalDelta}**`,
    `- New issues: **${review.newIssues}**`,
    `- Resolved issues: **${review.resolvedIssues}**`,
    '',
    '### File breakdown',
    topFiles || '- No file-level deltas detected',
  ].join('\n')
}

function getStatus(totalDelta: number, newIssues: number): 'clean' | 'improved' | 'regressed' {
  if (totalDelta > 0 || newIssues > 0) return 'regressed'
  if (totalDelta < 0) return 'improved'
  return 'clean'
}

export async function generateReview(projectPath: string, baseRef: string): Promise<DriftReview> {
  const resolvedPath = resolve(projectPath)
  const config = await loadConfig(resolvedPath)

  const currentFiles = analyzeProject(resolvedPath, config)
  const currentReport = buildReport(resolvedPath, currentFiles)

  let tempDir: string | undefined
  try {
    tempDir = extractFilesAtRef(resolvedPath, baseRef)
    const baseFiles = analyzeProject(tempDir, config)
    const baseReport = buildReport(tempDir, baseFiles)

    const remappedBase = {
      ...baseReport,
      files: baseReport.files.map((file) => ({
        ...file,
        path: resolve(resolvedPath, relative(tempDir!, file.path)),
      })),
    }

    const diff = computeDiff(remappedBase, currentReport, baseRef)
    const status = getStatus(diff.totalDelta, diff.newIssuesCount)
    const summary = status === 'regressed'
      ? `Drift regressed: +${diff.totalDelta} score and ${diff.newIssuesCount} new issue(s).`
      : status === 'improved'
        ? `Drift improved: ${diff.totalDelta} score delta and ${diff.resolvedIssuesCount} issue(s) resolved.`
        : 'No drift changes detected against base ref.'

    const review: DriftReview = {
      baseRef,
      scannedAt: new Date().toISOString(),
      totalDelta: diff.totalDelta,
      newIssues: diff.newIssuesCount,
      resolvedIssues: diff.resolvedIssuesCount,
      status,
      summary,
      markdown: '',
      diff,
    }

    review.markdown = formatReviewMarkdown(review)
    return review
  } finally {
    if (tempDir) cleanupTempDir(tempDir)
  }
}
