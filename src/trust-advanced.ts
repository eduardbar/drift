import type { DriftReport, DriftTrustReport, TrustAdvancedComparison, TrustDiffContext, TrustFixPriority } from './types.js'
import type { SnapshotEntry } from './snapshot.js'

const SYSTEMIC_GUIDANCE_LIMIT = 2
const TEAM_GUIDANCE_LIMIT = 3

function buildComparisonFromPreviousTrust(
  trustScore: number,
  previousTrust: Partial<DriftTrustReport> | undefined,
): TrustAdvancedComparison | undefined {
  if (!previousTrust || typeof previousTrust.trust_score !== 'number') return undefined

  const trustDelta = trustScore - previousTrust.trust_score
  const trend = trustDelta > 0 ? 'improving' : trustDelta < 0 ? 'regressing' : 'stable'

  return {
    source: 'previous-trust-json',
    trend,
    summary: `Trust moved ${trustDelta >= 0 ? '+' : ''}${trustDelta} vs provided previous trust JSON.`,
    trust_delta: trustDelta,
    previous_trust_score: previousTrust.trust_score,
    previous_merge_risk: previousTrust.merge_risk,
  }
}

function buildComparisonFromSnapshotHistory(
  report: DriftReport,
  snapshots: SnapshotEntry[] | undefined,
): TrustAdvancedComparison | undefined {
  const lastSnapshot = snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined
  if (!lastSnapshot) return undefined

  const snapshotScoreDelta = report.totalScore - lastSnapshot.score
  const trend = snapshotScoreDelta < 0 ? 'improving' : snapshotScoreDelta > 0 ? 'regressing' : 'stable'
  const snapshotContext = lastSnapshot.label
    ? `${lastSnapshot.timestamp} (${lastSnapshot.label})`
    : lastSnapshot.timestamp

  return {
    source: 'snapshot-history',
    trend,
    summary: `Drift score moved ${snapshotScoreDelta >= 0 ? '+' : ''}${snapshotScoreDelta} vs snapshot ${snapshotContext}.`,
    snapshot_score_delta: snapshotScoreDelta,
    snapshot_label: lastSnapshot.label || undefined,
    snapshot_timestamp: lastSnapshot.timestamp,
  }
}

function buildTeamGuidance(
  priorities: TrustFixPriority[],
  comparison: TrustAdvancedComparison | undefined,
  diffContext: TrustDiffContext | undefined,
): string[] {
  const systemicTargets = priorities
    .filter((priority) => priority.systemic)
    .slice(0, SYSTEMIC_GUIDANCE_LIMIT)
    .map((priority) => `${priority.rule} (x${priority.occurrences})`)

  const guidance: string[] = []
  if (systemicTargets.length > 0) {
    guidance.push(`Start with systemic rules: ${systemicTargets.join(', ')}.`)
  }

  if (comparison?.trend === 'regressing') {
    guidance.push('Trend regressed; freeze net-new debt in CI and assign owners per systemic rule.')
  }

  if (diffContext && diffContext.newIssues > 0) {
    guidance.push(`Block net-new issue growth first (+${diffContext.newIssues} new issue(s) in diff context).`)
  }

  if (guidance.length === 0) {
    guidance.push('Maintain current baseline and schedule periodic systemic debt cleanup by rule ownership.')
  }

  return guidance.slice(0, TEAM_GUIDANCE_LIMIT)
}

export function buildAdvancedContext(input: {
  report: DriftReport
  advancedOptions: {
    enabled?: boolean
    previousTrust?: Partial<DriftTrustReport>
    snapshots?: SnapshotEntry[]
  } | undefined
  trustScore: number
  fixPriorities: TrustFixPriority[]
  diffContext: TrustDiffContext | undefined
}): DriftTrustReport['advanced_context'] {
  if (input.advancedOptions?.enabled !== true) return undefined

  const comparison = buildComparisonFromPreviousTrust(input.trustScore, input.advancedOptions.previousTrust)
    ?? buildComparisonFromSnapshotHistory(input.report, input.advancedOptions.snapshots)

  return {
    comparison,
    team_guidance: buildTeamGuidance(input.fixPriorities, comparison, input.diffContext),
  }
}
