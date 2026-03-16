import { RULE_WEIGHTS } from './analyzer.js'
import type {
  DriftDiff,
  DriftReport,
  DriftTrustReport,
  MergeRiskLevel,
  TrustDiffContext,
  TrustFixPriority,
  TrustReason,
} from './types.js'

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

interface BuildTrustOptions {
  diff?: DriftDiff
}

interface TrustRenderOptions {
  json?: boolean
  markdown?: boolean
}

export interface TrustGateOptions {
  minTrust?: number
  maxRisk?: MergeRiskLevel
}

export const MERGE_RISK_ORDER: MergeRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function normalizeMergeRiskLevel(value: string): MergeRiskLevel | undefined {
  const normalized = value.toUpperCase()
  return MERGE_RISK_ORDER.find((level) => level === normalized)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toMergeRisk(trustScore: number): MergeRiskLevel {
  if (trustScore >= 80) return 'LOW'
  if (trustScore >= 60) return 'MEDIUM'
  if (trustScore >= 40) return 'HIGH'
  return 'CRITICAL'
}

function computeReasons(report: DriftReport): TrustReason[] {
  const architectureIssues = Object.entries(report.summary.byRule)
    .filter(([rule]) => ARCHITECTURE_RULES.has(rule))
    .reduce((sum, [, count]) => sum + count, 0)

  const worstHotspot = report.maintenanceRisk.hotspots[0]
  const reasons: TrustReason[] = [
    {
      label: 'Drift score pressure',
      detail: `Repository drift score is ${report.totalScore}/100.`,
      impact: Math.round(report.totalScore * 0.55),
    },
    {
      label: 'Error-level issues',
      detail: `${report.summary.errors} error issue(s) increase merge volatility.`,
      impact: Math.min(22, report.summary.errors * 4),
    },
    {
      label: 'Architecture signals',
      detail: `${architectureIssues} architecture-related issue(s) detected.`,
      impact: Math.min(24, architectureIssues * 6),
    },
    {
      label: 'Maintenance hotspots',
      detail: `Maintenance risk is ${report.maintenanceRisk.level.toUpperCase()} (${report.maintenanceRisk.score}/100).`,
      impact: Math.min(25, Math.round(report.maintenanceRisk.score * 0.25)),
    },
    {
      label: 'Highest-risk file',
      detail: worstHotspot
        ? `${worstHotspot.file} has hotspot risk ${worstHotspot.risk}/100.`
        : 'No hotspot concentration detected.',
      impact: worstHotspot ? Math.min(15, Math.round(worstHotspot.risk * 0.15)) : 0,
    },
  ]

  return reasons
    .filter((reason) => reason.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 4)
}

function effortFromWeight(weight: number): 'low' | 'medium' | 'high' {
  if (weight <= 6) return 'low'
  if (weight <= 12) return 'medium'
  return 'high'
}

function computeDiffContext(diff: DriftDiff): TrustDiffContext {
  const scoreRegressionPenalty = Math.max(0, diff.totalDelta) * 2
  const newIssuePenalty = diff.newIssuesCount * 3
  const churnPenalty = diff.files.length >= 15 ? 4 : 0
  const penalty = clamp(scoreRegressionPenalty + newIssuePenalty + churnPenalty, 0, 30)

  const scoreImprovementBonus = Math.max(0, -diff.totalDelta) * 2
  const resolvedIssueBonus = diff.resolvedIssuesCount * 2
  const bonus = clamp(scoreImprovementBonus + resolvedIssueBonus, 0, 20)

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

function computeFixPriorities(report: DriftReport): TrustFixPriority[] {
  const ordered = Object.entries(report.summary.byRule)
    .map(([rule, occurrences]) => {
      const weightConfig = RULE_WEIGHTS[rule] ?? { severity: 'warning' as const, weight: 6 }
      const severityBoost = weightConfig.severity === 'error' ? 25 : weightConfig.severity === 'warning' ? 12 : 4
      const priorityScore = occurrences * weightConfig.weight + severityBoost

      return {
        rule,
        severity: weightConfig.severity,
        occurrences,
        priorityScore,
        estimatedTrustGain: Math.min(30, Math.max(3, Math.round(priorityScore / 4))),
        effort: effortFromWeight(weightConfig.weight),
        suggestion: RULE_SUGGESTIONS[rule] ?? 'Address this rule in the highest-scored files first.',
      }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)

  return ordered.map((item, index) => ({
    rank: index + 1,
    rule: item.rule,
    severity: item.severity,
    occurrences: item.occurrences,
    estimated_trust_gain: item.estimatedTrustGain,
    effort: item.effort,
    suggestion: item.suggestion,
  }))
}

export function buildTrustReport(report: DriftReport, options?: BuildTrustOptions): DriftTrustReport {
  const reasons = computeReasons(report)

  const diffContext = options?.diff ? computeDiffContext(options.diff) : undefined
  if (diffContext && diffContext.netImpact > 0) {
    reasons.push({
      label: 'Diff regression signals',
      detail: `Against ${diffContext.baseRef}: score delta ${diffContext.scoreDelta >= 0 ? '+' : ''}${diffContext.scoreDelta}, +${diffContext.newIssues} new issue(s), -${diffContext.resolvedIssues} resolved.`,
      impact: diffContext.netImpact,
    })
  }

  const rankedReasons = reasons
    .filter((reason) => reason.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 4)

  const totalPenalty = rankedReasons.reduce((sum, reason) => sum + reason.impact, 0)
  const totalBonus = diffContext && diffContext.netImpact < 0 ? Math.abs(diffContext.netImpact) : 0
  const trustScore = clamp(Math.round(100 - totalPenalty + totalBonus), 0, 100)

  return {
    scannedAt: new Date().toISOString(),
    targetPath: report.targetPath,
    trust_score: trustScore,
    merge_risk: toMergeRisk(trustScore),
    top_reasons: rankedReasons,
    fix_priorities: computeFixPriorities(report),
    diff_context: diffContext,
  }
}

export function formatTrustConsole(trust: DriftTrustReport): string {
  const diffContext = trust.diff_context
  const diffLines = diffContext
    ? [
      `- base: ${diffContext.baseRef}`,
      `- status: ${diffContext.status.toUpperCase()}`,
      `- score delta: ${diffContext.scoreDelta >= 0 ? '+' : ''}${diffContext.scoreDelta}`,
      `- issues: +${diffContext.newIssues} new / -${diffContext.resolvedIssues} resolved`,
      `- impact: +${diffContext.penalty} penalty / -${diffContext.bonus} bonus (net ${diffContext.netImpact >= 0 ? '+' : ''}${diffContext.netImpact})`,
    ].join('\n')
    : undefined

  const reasons = trust.top_reasons.length === 0
    ? '- none'
    : trust.top_reasons.map((reason) => `- ${reason.label}: ${reason.detail} (impact ${reason.impact})`).join('\n')

  const priorities = trust.fix_priorities.length === 0
    ? '- none'
    : trust.fix_priorities
      .map((priority) =>
        `- #${priority.rank} ${priority.rule} (${priority.severity}, x${priority.occurrences}): ${priority.suggestion}`
      )
      .join('\n')

  const sections = [
    'drift trust',
    '',
    `Trust Score: ${trust.trust_score}/100`,
    `Merge Risk: ${trust.merge_risk}`,
    '',
    'Top Reasons:',
    reasons,
    '',
    'Fix Priorities:',
    priorities,
  ]

  if (diffLines) {
    sections.splice(5, 0, 'Diff Context:', diffLines, '')
  }

  return sections.join('\n')
}

export function formatTrustMarkdown(trust: DriftTrustReport): string {
  const diffContext = trust.diff_context

  const reasons = trust.top_reasons.length === 0
    ? '- none'
    : trust.top_reasons.map((reason) => `- **${reason.label}**: ${reason.detail} (impact ${reason.impact})`).join('\n')

  const priorities = trust.fix_priorities.length === 0
    ? '- none'
    : trust.fix_priorities
      .map((priority) =>
        `- #${priority.rank} \`${priority.rule}\` (${priority.severity}, x${priority.occurrences}, effort: ${priority.effort}) - ${priority.suggestion}`
      )
      .join('\n')

  const diffBlock = !diffContext
    ? [
      '- Base ref: not provided',
      '- Diff-aware adjustment: not applied',
    ].join('\n')
    : [
      `- Base ref: \`${diffContext.baseRef}\``,
      `- Diff status: **${diffContext.status.toUpperCase()}**`,
      `- Score delta: **${diffContext.scoreDelta >= 0 ? '+' : ''}${diffContext.scoreDelta}**`,
      `- Issues: **+${diffContext.newIssues}** new / **-${diffContext.resolvedIssues}** resolved`,
      `- Trust adjustment: **+${diffContext.penalty}** penalty / **-${diffContext.bonus}** bonus (net ${diffContext.netImpact >= 0 ? '+' : ''}${diffContext.netImpact})`,
    ].join('\n')

  return [
    '## drift trust',
    '',
    `- Trust Score: **${trust.trust_score}/100**`,
    `- Merge Risk: **${trust.merge_risk}**`,
    `- Target: \`${trust.targetPath}\``,
    '',
    '### Diff signals',
    diffBlock,
    '',
    '### Top reasons',
    reasons,
    '',
    '### Fix priorities',
    priorities,
  ].join('\n')
}

export function formatTrustJson(trust: DriftTrustReport): string {
  return JSON.stringify(trust, null, 2)
}

export function renderTrustOutput(trust: DriftTrustReport, options?: TrustRenderOptions): string {
  if (options?.json) return formatTrustJson(trust)
  if (options?.markdown) return formatTrustMarkdown(trust)
  return formatTrustConsole(trust)
}

export function shouldFailByMaxRisk(actual: MergeRiskLevel, allowedMaxRisk: MergeRiskLevel): boolean {
  return MERGE_RISK_ORDER.indexOf(actual) > MERGE_RISK_ORDER.indexOf(allowedMaxRisk)
}

export function shouldFailTrustGate(trust: DriftTrustReport, options: TrustGateOptions): boolean {
  if (typeof options.minTrust === 'number' && !Number.isNaN(options.minTrust) && trust.trust_score < options.minTrust) {
    return true
  }

  if (options.maxRisk && shouldFailByMaxRisk(trust.merge_risk, options.maxRisk)) {
    return true
  }

  return false
}
