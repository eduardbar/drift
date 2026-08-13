import type { DiffHunk, DiffSource } from '../types/ai-guard.js'
import type { LayerDefinition, ModuleBoundary } from '../types/config.js'

/**
 * Drift Guardian — domain model (Phase 1).
 *
 * All types are JSON-serializable and hold no logic. Pure helpers live in
 * `./domain.ts`; the engine that evaluates rules lives in later phases.
 */

export type GuardianSeverity = 'info' | 'warning' | 'error' | 'blocking'

export type GuardianFindingCategory =
  | 'architecture'
  | 'dependency'
  | 'protected-path'
  | 'api-change'
  | 'policy'
  | 'custom'

export interface GuardianLocation {
  file: string
  line?: number
  column?: number
  endLine?: number
}

export interface GuardianFinding {
  id: string
  ruleId: string
  category: GuardianFindingCategory
  severity: GuardianSeverity
  message: string
  locations: GuardianLocation[]
  evidence?: string
  suggestion?: string
  metadata?: Record<string, unknown>
}

export interface GuardianRule {
  id: string
  category: GuardianFindingCategory
  severity: GuardianSeverity
  enabled: boolean
  description?: string
  /** Opaque condition interpreted by the policy engine (Phase 3+). Versioned by policy.version. */
  condition?: Record<string, unknown>
}

export interface GuardianPolicy {
  id: string
  name: string
  description?: string
  version: string
  rules: GuardianRule[]
}

export interface GuardianChange {
  status: 'added' | 'modified' | 'deleted' | 'rename' | 'binary'
  oldPath?: string
  newPath?: string
  additions: number
  deletions: number
  changedLines: number
  hunks: DiffHunk[]
}

export interface GuardianContext {
  projectPath: string
  source: DiffSource
  baseRef?: string
  branch?: string
  changes: GuardianChange[]
  config: GuardianConfig
  analysis: {
    layers?: LayerDefinition[]
    modules?: ModuleBoundary[]
  }
}

export type GuardianVerdict = 'pass' | 'warn' | 'fail'

export interface GuardianResult {
  verdict: GuardianVerdict
  passed: boolean
  findings: GuardianFinding[]
  affectedFiles: string[]
  changes: GuardianChange[]
  summary: { blocking: number; errors: number; warnings: number; infos: number }
  scannedAt: string
  aiReview?: AIReview
}

export interface AIReview {
  provider: string
  summary: string
  riskExplanations: Array<{ findingId: string; explanation: string; confidence?: number }>
  missingTests: string[]
  behavioralRisks: string[]
  generatedAt: string
}

/**
 * Contract every AI provider implements. The core depends only on this
 * interface — providers never affect the deterministic verdict.
 */
export interface AIReviewProvider {
  readonly name: string
  review(context: GuardianContext, findings: GuardianFinding[]): Promise<AIReview | undefined>
}

// ---------------------------------------------------------------------------
// Configuration (canonical schema: docs/guardian/TRD.md §4)
// ---------------------------------------------------------------------------

export interface GuardianArchitectureRule {
  id?: string
  from: string | string[]
  cannotDependOn?: string | string[]
  severity?: GuardianSeverity
  enabled?: boolean
}

export interface GuardianForbiddenDependency {
  from?: string
  to: string
  reason?: string
  severity?: GuardianSeverity
}

export interface GuardianProtectedPath {
  pattern: string
  reason?: string
  severity?: GuardianSeverity
  allowAi?: boolean
}

export interface GuardianAiConfig {
  enabled: boolean
  provider?: string
  model?: string
  review?: {
    architecture?: boolean
    missingTests?: boolean
    behavior?: boolean
    prSummary?: boolean
  }
  maxFindings?: number
  timeoutSeconds?: number
}

export interface GuardianExitConfig {
  failOn?: GuardianSeverity[]
  warnOnViolation?: boolean
}

export interface GuardianConfig {
  version: 1
  architecture?: {
    rules?: GuardianArchitectureRule[]
  }
  dependencies?: {
    forbidden?: GuardianForbiddenDependency[]
  }
  protectedPaths?: GuardianProtectedPath[]
  api?: {
    detectPublicChanges?: boolean
    breakingOnly?: boolean
  }
  ai?: GuardianAiConfig
  exit?: GuardianExitConfig
}
