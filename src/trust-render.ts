import type { DriftTrustReport, TrustDiffContext, TrustFixPriority, TrustReason } from './types.js'

export function renderTrustReasons(reasons: TrustReason[]): string {
  if (reasons.length === 0) return '- none'
  return reasons.map((reason) => `- ${reason.label}: ${reason.detail} (impact ${reason.impact})`).join('\n')
}

export function renderTrustPriorities(priorities: TrustFixPriority[]): string {
  if (priorities.length === 0) return '- none'
  return priorities
    .map((priority) =>
      `- #${priority.rank} ${priority.rule} (${priority.severity}, x${priority.occurrences}${priority.confidence ? `, confidence ${priority.confidence}` : ''}): ${priority.suggestion}`
    )
    .join('\n')
}

export function renderTrustMarkdownReasons(reasons: TrustReason[]): string {
  if (reasons.length === 0) return '- none'
  return reasons.map((reason) => `- **${reason.label}**: ${reason.detail} (impact ${reason.impact})`).join('\n')
}

export function renderTrustMarkdownPriorities(priorities: TrustFixPriority[]): string {
  if (priorities.length === 0) return '- none'
  return priorities
    .map((priority) =>
      `- #${priority.rank} \`${priority.rule}\` (${priority.severity}, x${priority.occurrences}, effort: ${priority.effort}${priority.confidence ? `, confidence: ${priority.confidence}` : ''}) - ${priority.suggestion}${priority.explanation ? ` ${priority.explanation}` : ''}`
    )
    .join('\n')
}

export function renderTrustDiffBlock(diffContext: TrustDiffContext | undefined): string {
  if (!diffContext) {
    return [
      '- Base ref: not provided',
      '- Diff-aware adjustment: not applied',
    ].join('\n')
  }

  return [
    `- Base ref: \`${diffContext.baseRef}\``,
    `- Diff status: **${diffContext.status.toUpperCase()}**`,
    `- Score delta: **${diffContext.scoreDelta >= 0 ? '+' : ''}${diffContext.scoreDelta}**`,
    `- Issues: **+${diffContext.newIssues}** new / **-${diffContext.resolvedIssues}** resolved`,
    `- Trust adjustment: **+${diffContext.penalty}** penalty / **-${diffContext.bonus}** bonus (net ${diffContext.netImpact >= 0 ? '+' : ''}${diffContext.netImpact})`,
  ].join('\n')
}

export function renderTrustAdvancedComparison(advancedContext: DriftTrustReport['advanced_context']): string {
  if (!advancedContext?.comparison) return '- Historical comparison not available'

  return [
    `- Source: \`${advancedContext.comparison.source}\``,
    `- Trend: **${advancedContext.comparison.trend.toUpperCase()}**`,
    `- Summary: ${advancedContext.comparison.summary}`,
  ].join('\n')
}

export function renderTrustAdvancedGuidance(advancedContext: DriftTrustReport['advanced_context']): string {
  if (!advancedContext?.team_guidance?.length) return '- none'
  return advancedContext.team_guidance.map((item) => `- ${item}`).join('\n')
}
