import type { DriftIssue, DriftOutputMetadata } from './core.js'

export type MergeRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TrustGatePolicyPreset {
  branch: string
  enabled?: boolean
  minTrust?: number
  maxRisk?: MergeRiskLevel
}

export interface TrustGatePolicyPack {
  enabled?: boolean
  minTrust?: number
  maxRisk?: MergeRiskLevel
}

export interface TrustGatePolicyConfig {
  enabled?: boolean
  minTrust?: number
  maxRisk?: MergeRiskLevel
  presets?: TrustGatePolicyPreset[]
  policyPacks?: Record<string, TrustGatePolicyPack>
}

export interface TrustReason {
  label: string
  detail: string
  impact: number
}

export interface TrustFixPriority {
  rank: number
  rule: string
  severity: DriftIssue['severity']
  occurrences: number
  estimated_trust_gain: number
  effort: 'low' | 'medium' | 'high'
  suggestion: string
  confidence?: 'low' | 'medium' | 'high'
  explanation?: string
  systemic?: boolean
}

export interface TrustAdvancedComparison {
  source: 'previous-trust-json' | 'snapshot-history'
  trend: 'improving' | 'regressing' | 'stable'
  summary: string
  trust_delta?: number
  previous_trust_score?: number
  previous_merge_risk?: MergeRiskLevel
  snapshot_score_delta?: number
  snapshot_label?: string
  snapshot_timestamp?: string
}

export interface TrustAdvancedContext {
  comparison?: TrustAdvancedComparison
  team_guidance: string[]
}

export interface TrustDiffContext {
  baseRef: string
  status: 'improved' | 'regressed' | 'neutral'
  scoreDelta: number
  newIssues: number
  resolvedIssues: number
  filesChanged: number
  penalty: number
  bonus: number
  netImpact: number
}

export interface DriftTrustReport {
  scannedAt: string
  targetPath: string
  trust_score: number
  merge_risk: MergeRiskLevel
  top_reasons: TrustReason[]
  fix_priorities: TrustFixPriority[]
  diff_context?: TrustDiffContext
  advanced_context?: TrustAdvancedContext
}

export type DriftTrustReportJson = DriftTrustReport & DriftOutputMetadata

export interface TrustKpiDiagnostic {
  level: 'warning' | 'error'
  code: 'path-not-found' | 'path-not-supported' | 'read-failed' | 'parse-failed' | 'invalid-shape' | 'invalid-diff-context'
  message: string
  file?: string
}

export interface TrustScoreStats {
  average: number | null
  median: number | null
  min: number | null
  max: number | null
}

export interface TrustDiffTrendSummary {
  available: boolean
  samples: number
  statusDistribution: {
    improved: number
    regressed: number
    neutral: number
  }
  scoreDelta: {
    average: number | null
    median: number | null
  }
  issues: {
    newTotal: number
    resolvedTotal: number
    netNew: number
  }
}

export interface TrustKpiReport {
  generatedAt: string
  input: string
  files: {
    matched: number
    parsed: number
    malformed: number
  }
  prsEvaluated: number
  mergeRiskDistribution: Record<MergeRiskLevel, number>
  trustScore: TrustScoreStats
  highRiskRatio: number | null
  diffTrend: TrustDiffTrendSummary
  diagnostics: TrustKpiDiagnostic[]
}
