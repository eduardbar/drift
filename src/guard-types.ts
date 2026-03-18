import type { DriftAnalysisOptions, DriftDiff, DriftIssue, DriftReport } from './types.js'

export type IssueSeverity = DriftIssue['severity']

export interface GuardBaseline {
  score?: number
  totalIssues?: number
  errors?: number
  warnings?: number
  infos?: number
  bySeverity?: Partial<Record<IssueSeverity, number>>
  summary?: {
    errors?: number
    warnings?: number
    infos?: number
  }
}

export interface GuardThresholds {
  error?: number
  warning?: number
  info?: number
}

export interface GuardOptions {
  baseRef?: string
  baselinePath?: string
  baseline?: GuardBaseline
  budget?: number
  bySeverity?: GuardThresholds
  analysis?: DriftAnalysisOptions
}

export interface GuardMetrics {
  scoreDelta: number
  totalIssuesDelta: number
  severityDelta: Record<IssueSeverity, number>
}

export interface GuardCheck {
  id: string
  passed: boolean
  actual: number
  limit: number
  message: string
}

export interface GuardEvaluation {
  passed: boolean
  checks: GuardCheck[]
}

export interface GuardResult {
  scannedAt: string
  projectPath: string
  mode: 'diff' | 'baseline'
  passed: boolean
  baseRef?: string
  baselinePath?: string
  metrics: GuardMetrics
  checks: GuardCheck[]
  current: DriftReport
  diff?: DriftDiff
}
