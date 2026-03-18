import type { MergeRiskLevel, TrustDiffContext } from './types.js'

export interface ParsedTrustArtifact {
  filePath: string
  trustScore: number
  mergeRisk: MergeRiskLevel
  diffContext?: TrustDiffContext
}

export interface DiscoverResult {
  files: string[]
  diagnostics: import('./types.js').TrustKpiDiagnostic[]
}

export type DiffStatus = 'improved' | 'regressed' | 'neutral'

export interface TrustKpiOptions {
  cwd?: string
}
