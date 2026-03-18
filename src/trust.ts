import type {
  DriftDiff,
  DriftReport,
  DriftTrustReport,
  DriftTrustReportJson,
  MergeRiskLevel,
} from './types.js'
import type { SnapshotEntry } from './snapshot.js'
import { MERGE_RISK_ORDER } from './trust-policy.js'
import type { TrustGateOptions } from './trust-policy.js'
import { buildAdvancedContext } from './trust-advanced.js'
import {
  TOP_REASONS_SLICE,
  buildDiffRegressionReason,
  clamp,
  computeDiffContext,
  computeFixPriorities,
  computeReasons,
  toMergeRisk,
} from './trust-scoring.js'
import {
  renderTrustAdvancedComparison,
  renderTrustAdvancedGuidance,
  renderTrustDiffBlock,
  renderTrustMarkdownPriorities,
  renderTrustMarkdownReasons,
  renderTrustPriorities,
  renderTrustReasons,
} from './trust-render.js'
import { OUTPUT_SCHEMA, withOutputMetadata } from './output-metadata.js'

export {
  MERGE_RISK_ORDER,
  detectBranchName,
  explainTrustGatePolicy,
  formatTrustGatePolicyExplanation,
  normalizeMergeRiskLevel,
  resolveTrustGatePolicy,
} from './trust-policy.js'
export type {
  TrustGatePolicyExplanation,
  TrustGatePolicyResolutionOptions,
  TrustGatePolicyResolutionStep,
  TrustGateOptions,
} from './trust-policy.js'

interface BuildTrustOptions {
  diff?: DriftDiff
  advanced?: {
    enabled?: boolean
    previousTrust?: Partial<DriftTrustReport>
    snapshots?: SnapshotEntry[]
  }
}

interface TrustRenderOptions {
  json?: boolean
  markdown?: boolean
}

export interface TrustGateEvaluation {
  shouldFail: boolean
  reasons: string[]
  checks: {
    gateDisabled: boolean
    belowMinTrust: boolean
    aboveMaxRisk: boolean
    minTrust?: number
    maxRisk?: MergeRiskLevel
  }
}

const CONSOLE_DIFF_INSERT_INDEX = 5

export function buildTrustReport(report: DriftReport, options?: BuildTrustOptions): DriftTrustReport {
  const reasons = computeReasons(report)

  const diffContext = options?.diff ? computeDiffContext(options.diff) : undefined
  if (diffContext && diffContext.netImpact > 0) {
    reasons.push(buildDiffRegressionReason(diffContext))
  }

  const rankedReasons = reasons
    .filter((reason) => reason.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, TOP_REASONS_SLICE)

  const totalPenalty = rankedReasons.reduce((sum, reason) => sum + reason.impact, 0)
  const totalBonus = diffContext && diffContext.netImpact < 0 ? Math.abs(diffContext.netImpact) : 0
  const trustScore = clamp(Math.round(100 - totalPenalty + totalBonus), 0, 100)

  const advancedMode = options?.advanced?.enabled === true
  const fixPriorities = computeFixPriorities(report, advancedMode)
  const advancedContext = buildAdvancedContext({
    report,
    advancedOptions: options?.advanced,
    trustScore,
    fixPriorities,
    diffContext,
  })

  return {
    scannedAt: new Date().toISOString(),
    targetPath: report.targetPath,
    trust_score: trustScore,
    merge_risk: toMergeRisk(trustScore),
    top_reasons: rankedReasons,
    fix_priorities: fixPriorities,
    diff_context: diffContext,
    ...(advancedContext ? { advanced_context: advancedContext } : {}),
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

  const reasons = renderTrustReasons(trust.top_reasons)
  const priorities = renderTrustPriorities(trust.fix_priorities)

  const advanced = trust.advanced_context
  const advancedComparison = advanced?.comparison
    ? [
      `- source: ${advanced.comparison.source}`,
      `- trend: ${advanced.comparison.trend.toUpperCase()}`,
      `- summary: ${advanced.comparison.summary}`,
    ].join('\n')
    : '- no historical comparison available'
  const advancedGuidance = advanced?.team_guidance?.length
    ? advanced.team_guidance.map((item) => `- ${item}`).join('\n')
    : '- none'

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
    sections.splice(CONSOLE_DIFF_INSERT_INDEX, 0, 'Diff Context:', diffLines, '')
  }

  if (advanced) {
    sections.push('', 'Advanced Team Guidance:', advancedComparison, '', advancedGuidance)
  }

  return sections.join('\n')
}

export function formatTrustMarkdown(trust: DriftTrustReport): string {
  const reasons = renderTrustMarkdownReasons(trust.top_reasons)
  const priorities = renderTrustMarkdownPriorities(trust.fix_priorities)
  const diffBlock = renderTrustDiffBlock(trust.diff_context)
  const advancedComparison = renderTrustAdvancedComparison(trust.advanced_context)
  const advancedGuidance = renderTrustAdvancedGuidance(trust.advanced_context)

  const sections = [
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
  ]

  if (trust.advanced_context) {
    sections.push('', '### Advanced comparison', advancedComparison, '', '### Team guidance', advancedGuidance)
  }

  return sections.join('\n')
}

function formatTrustJsonObject(trust: DriftTrustReport): DriftTrustReportJson {
  return withOutputMetadata(trust, OUTPUT_SCHEMA.trust)
}

export function formatTrustJson(trust: DriftTrustReport): string {
  return JSON.stringify(formatTrustJsonObject(trust), null, 2)
}

export function renderTrustOutput(trust: DriftTrustReport, options?: TrustRenderOptions): string {
  if (options?.json) return formatTrustJson(trust)
  if (options?.markdown) return formatTrustMarkdown(trust)
  return formatTrustConsole(trust)
}

export function shouldFailByMaxRisk(actual: MergeRiskLevel, allowedMaxRisk: MergeRiskLevel): boolean {
  return MERGE_RISK_ORDER.indexOf(actual) > MERGE_RISK_ORDER.indexOf(allowedMaxRisk)
}

export function evaluateTrustGate(trust: DriftTrustReport, options: TrustGateOptions): TrustGateEvaluation {
  if (options.enabled === false) {
    return {
      shouldFail: false,
      reasons: ['trust gate disabled by policy'],
      checks: {
        gateDisabled: true,
        belowMinTrust: false,
        aboveMaxRisk: false,
        minTrust: options.minTrust,
        maxRisk: options.maxRisk,
      },
    }
  }

  const belowMinTrust =
    typeof options.minTrust === 'number' &&
    !Number.isNaN(options.minTrust) &&
    trust.trust_score < options.minTrust

  const aboveMaxRisk = Boolean(options.maxRisk && shouldFailByMaxRisk(trust.merge_risk, options.maxRisk))
  const reasons: string[] = []

  if (belowMinTrust) {
    reasons.push(`trust ${trust.trust_score} is below minTrust ${options.minTrust}`)
  }

  if (aboveMaxRisk && options.maxRisk) {
    reasons.push(`merge risk ${trust.merge_risk} exceeds maxRisk ${options.maxRisk}`)
  }

  return {
    shouldFail: belowMinTrust || aboveMaxRisk,
    reasons,
    checks: {
      gateDisabled: false,
      belowMinTrust,
      aboveMaxRisk,
      minTrust: options.minTrust,
      maxRisk: options.maxRisk,
    },
  }
}

export function shouldFailTrustGate(trust: DriftTrustReport, options: TrustGateOptions): boolean {
  return evaluateTrustGate(trust, options).shouldFail
}
