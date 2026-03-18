import type { DriftDiff, DriftIssue, DriftReport } from './types.js'
import type { GuardMetrics, IssueSeverity } from './guard-types.js'
import type { NormalizedBaseline } from './guard-baseline.js'

function createSeverityDelta(): Record<IssueSeverity, number> {
  return {
    error: 0,
    warning: 0,
    info: 0,
  }
}

function applySeverityDelta(
  delta: Record<IssueSeverity, number>,
  issues: DriftIssue[],
  direction: 1 | -1,
): void {
  for (const issue of issues) {
    delta[issue.severity] += direction
  }
}

function countSeverityDeltaFromDiff(diff: DriftDiff): Record<IssueSeverity, number> {
  const severityDelta = createSeverityDelta()

  for (const file of diff.files) {
    applySeverityDelta(severityDelta, file.newIssues, 1)
    applySeverityDelta(severityDelta, file.resolvedIssues, -1)
  }

  return severityDelta
}

export function buildMetricsFromDiff(diff: DriftDiff): GuardMetrics {
  return {
    scoreDelta: diff.totalDelta,
    totalIssuesDelta: diff.newIssuesCount - diff.resolvedIssuesCount,
    severityDelta: countSeverityDeltaFromDiff(diff),
  }
}

export function buildMetricsFromBaseline(current: DriftReport, baseline: NormalizedBaseline): GuardMetrics {
  return {
    scoreDelta: current.totalScore - (baseline.score ?? current.totalScore),
    totalIssuesDelta: current.totalIssues - (baseline.totalIssues ?? current.totalIssues),
    severityDelta: {
      error: current.summary.errors - (baseline.bySeverity.error ?? current.summary.errors),
      warning: current.summary.warnings - (baseline.bySeverity.warning ?? current.summary.warnings),
      info: current.summary.infos - (baseline.bySeverity.info ?? current.summary.infos),
    },
  }
}
