import { RULE_WEIGHTS } from './analyzer.js'
import type { DriftDiff, DriftReport, MergeRiskLevel, TrustDiffContext, TrustFixPriority, TrustReason } from './types.js'

const ARCHITECTURE_RULES = new Set([
  'circular-dependency',
  'layer-violation',
  'cross-boundary-import',
  'controller-no-db',
  'service-no-http',
])

const RULE_SUGGESTIONS: Record<string, string> = {
  'circular-dependency': 'Break cycles first to reduce hidden merge blast radius.',
  'layer-violation': 'Fix layer violations to keep architecture boundaries enforceable.',
  'high-complexity': 'Split branch-heavy functions before adding more logic.',
  'deep-nesting': 'Flatten control flow with early returns.',
  'large-file': 'Split monolithic files by responsibility before merge.',
  'large-function': 'Extract smaller functions to reduce review complexity.',
  'catch-swallow': 'Handle or rethrow swallowed errors to avoid silent failures.',
  'debug-leftover': 'Remove debug leftovers from production paths.',
  'semantic-duplication': 'Consolidate duplicated logic to prevent divergent fixes.',
  'dead-file': 'Delete or wire dead files to avoid stale merge artifacts.',
}

const SYSTEMIC_RULES = new Set([
  'circular-dependency',
  'layer-violation',
  'cross-boundary-import',
  'unused-export',
  'unused-dependency',
  'dead-file',
  'semantic-duplication',
  'controller-no-db',
  'service-no-http',
])

const TRUST_LOW_MIN = 80
const TRUST_MEDIUM_MIN = 60
const TRUST_HIGH_MIN = 40

const DRIFT_PRESSURE_FACTOR = 0.55
const ERROR_IMPACT_CAP = 22
const ERROR_IMPACT_FACTOR = 4
const ARCHITECTURE_IMPACT_CAP = 24
const ARCHITECTURE_IMPACT_FACTOR = 6
const HOTSPOT_IMPACT_CAP = 25
const HOTSPOT_IMPACT_FACTOR = 0.25
const WORST_FILE_IMPACT_CAP = 15
const WORST_FILE_IMPACT_FACTOR = 0.15
const TOP_REASONS_LIMIT = 4

const EFFORT_LOW_MAX_WEIGHT = 6
const EFFORT_MEDIUM_MAX_WEIGHT = 12

const SCORE_REGRESSION_PENALTY_FACTOR = 2
const NEW_ISSUE_PENALTY_FACTOR = 3
const CHURN_FILE_THRESHOLD = 15
const CHURN_PENALTY = 4
const PENALTY_CAP = 30
const RESOLVED_ISSUE_BONUS_FACTOR = 2
const BONUS_CAP = 20

const SEVERITY_ERROR_SCORE = 4
const SEVERITY_WARNING_SCORE = 2
const SEVERITY_INFO_SCORE = 1
const PRIORITY_OCCURRENCE_FACTOR = 2
const SYSTEMIC_CONFIDENCE_BOOST = 2
const CONFIDENCE_HIGH_MIN = 12
const CONFIDENCE_MEDIUM_MIN = 7

const DEFAULT_WEIGHT_CONFIG = { severity: 'warning' as const, weight: EFFORT_LOW_MAX_WEIGHT }
const SEVERITY_BOOST_ERROR = 25
const SEVERITY_BOOST_WARNING = 12
const SEVERITY_BOOST_INFO = 4
const SYSTEMIC_PRIORITY_BOOST = 25
const TRUST_GAIN_MAX = 30
const TRUST_GAIN_MIN = 3
const TRUST_GAIN_DIVISOR = 4
const FIX_PRIORITIES_LIMIT = 5

export const TOP_REASONS_SLICE = TOP_REASONS_LIMIT

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function toMergeRisk(trustScore: number): MergeRiskLevel {
  if (trustScore >= TRUST_LOW_MIN) return 'LOW'
  if (trustScore >= TRUST_MEDIUM_MIN) return 'MEDIUM'
  if (trustScore >= TRUST_HIGH_MIN) return 'HIGH'
  return 'CRITICAL'
}

export function computeReasons(report: DriftReport): TrustReason[] {
  const architectureIssues = Object.entries(report.summary.byRule)
    .filter(([rule]) => ARCHITECTURE_RULES.has(rule))
    .reduce((sum, [, count]) => sum + count, 0)

  const worstHotspot = report.maintenanceRisk.hotspots[0]
  const reasons: TrustReason[] = [
    {
      label: 'Drift score pressure',
      detail: `Repository drift score is ${report.totalScore}/100.`,
      impact: Math.round(report.totalScore * DRIFT_PRESSURE_FACTOR),
    },
    {
      label: 'Error-level issues',
      detail: `${report.summary.errors} error issue(s) increase merge volatility.`,
      impact: Math.min(ERROR_IMPACT_CAP, report.summary.errors * ERROR_IMPACT_FACTOR),
    },
    {
      label: 'Architecture signals',
      detail: `${architectureIssues} architecture-related issue(s) detected.`,
      impact: Math.min(ARCHITECTURE_IMPACT_CAP, architectureIssues * ARCHITECTURE_IMPACT_FACTOR),
    },
    {
      label: 'Maintenance hotspots',
      detail: `Maintenance risk is ${report.maintenanceRisk.level.toUpperCase()} (${report.maintenanceRisk.score}/100).`,
      impact: Math.min(HOTSPOT_IMPACT_CAP, Math.round(report.maintenanceRisk.score * HOTSPOT_IMPACT_FACTOR)),
    },
    {
      label: 'Highest-risk file',
      detail: worstHotspot
        ? `${worstHotspot.file} has hotspot risk ${worstHotspot.risk}/100.`
        : 'No hotspot concentration detected.',
      impact: worstHotspot ? Math.min(WORST_FILE_IMPACT_CAP, Math.round(worstHotspot.risk * WORST_FILE_IMPACT_FACTOR)) : 0,
    },
  ]

  return reasons
    .filter((reason) => reason.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, TOP_REASONS_LIMIT)
}

function effortFromWeight(weight: number): 'low' | 'medium' | 'high' {
  if (weight <= EFFORT_LOW_MAX_WEIGHT) return 'low'
  if (weight <= EFFORT_MEDIUM_MAX_WEIGHT) return 'medium'
  return 'high'
}

export function computeDiffContext(diff: DriftDiff): TrustDiffContext {
  const scoreRegressionPenalty = Math.max(0, diff.totalDelta) * SCORE_REGRESSION_PENALTY_FACTOR
  const newIssuePenalty = diff.newIssuesCount * NEW_ISSUE_PENALTY_FACTOR
  const churnPenalty = diff.files.length >= CHURN_FILE_THRESHOLD ? CHURN_PENALTY : 0
  const penalty = clamp(scoreRegressionPenalty + newIssuePenalty + churnPenalty, 0, PENALTY_CAP)

  const scoreImprovementBonus = Math.max(0, -diff.totalDelta) * SCORE_REGRESSION_PENALTY_FACTOR
  const resolvedIssueBonus = diff.resolvedIssuesCount * RESOLVED_ISSUE_BONUS_FACTOR
  const bonus = clamp(scoreImprovementBonus + resolvedIssueBonus, 0, BONUS_CAP)

  const netImpact = penalty - bonus
  const status = netImpact > 0 ? 'regressed' : netImpact < 0 ? 'improved' : 'neutral'

  return {
    baseRef: diff.baseRef,
    status,
    scoreDelta: diff.totalDelta,
    newIssues: diff.newIssuesCount,
    resolvedIssues: diff.resolvedIssuesCount,
    filesChanged: diff.files.length,
    penalty,
    bonus,
    netImpact,
  }
}

function confidenceFromPrioritySignals(
  occurrences: number,
  severity: 'error' | 'warning' | 'info',
  systemic: boolean,
): 'low' | 'medium' | 'high' {
  const severityScore = severity === 'error' ? SEVERITY_ERROR_SCORE : severity === 'warning' ? SEVERITY_WARNING_SCORE : SEVERITY_INFO_SCORE
  const systemicScore = systemic ? SYSTEMIC_CONFIDENCE_BOOST : 0
  const score = occurrences * PRIORITY_OCCURRENCE_FACTOR + severityScore + systemicScore

  if (score >= CONFIDENCE_HIGH_MIN) return 'high'
  if (score >= CONFIDENCE_MEDIUM_MIN) return 'medium'
  return 'low'
}

export function computeFixPriorities(report: DriftReport, advancedMode = false): TrustFixPriority[] {
  const ordered = Object.entries(report.summary.byRule)
    .map(([rule, occurrences]) => {
      const weightConfig = RULE_WEIGHTS[rule] ?? DEFAULT_WEIGHT_CONFIG
      const severityBoost = weightConfig.severity === 'error' ? SEVERITY_BOOST_ERROR : weightConfig.severity === 'warning' ? SEVERITY_BOOST_WARNING : SEVERITY_BOOST_INFO
      const systemic = SYSTEMIC_RULES.has(rule)
      const systemicBoost = advancedMode && systemic ? SYSTEMIC_PRIORITY_BOOST : 0
      const priorityScore = occurrences * weightConfig.weight + severityBoost + systemicBoost
      const confidence = confidenceFromPrioritySignals(occurrences, weightConfig.severity, systemic)
      const explanation = advancedMode
        ? systemic
          ? 'System-level rule that propagates risk across multiple teams and modules.'
          : 'Local rule with contained impact; treat as team-level cleanup after systemic fixes.'
        : undefined

      return {
        rule,
        severity: weightConfig.severity,
        occurrences,
        systemic,
        priorityScore,
        estimatedTrustGain: Math.min(TRUST_GAIN_MAX, Math.max(TRUST_GAIN_MIN, Math.round(priorityScore / TRUST_GAIN_DIVISOR))),
        effort: effortFromWeight(weightConfig.weight),
        suggestion: RULE_SUGGESTIONS[rule] ?? 'Address this rule in the highest-scored files first.',
        confidence,
        explanation,
      }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, FIX_PRIORITIES_LIMIT)

  return ordered.map((item, index) => ({
    rank: index + 1,
    rule: item.rule,
    severity: item.severity,
    occurrences: item.occurrences,
    estimated_trust_gain: item.estimatedTrustGain,
    effort: item.effort,
    suggestion: item.suggestion,
    ...(advancedMode ? { confidence: item.confidence, explanation: item.explanation, systemic: item.systemic } : {}),
  }))
}

export function buildDiffRegressionReason(diffContext: TrustDiffContext): TrustReason {
  return {
    label: 'Diff regression signals',
    detail: `Against ${diffContext.baseRef}: score delta ${diffContext.scoreDelta >= 0 ? '+' : ''}${diffContext.scoreDelta}, +${diffContext.newIssues} new issue(s), -${diffContext.resolvedIssues} resolved.`,
    impact: diffContext.netImpact,
  }
}
