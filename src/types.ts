export interface DriftIssue {
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
  line: number
  column: number
  snippet: string
}

export interface FileReport {
  path: string
  issues: DriftIssue[]
  score: number // 0–100, higher = more drift
}

export interface DriftReport {
  scannedAt: string
  targetPath: string
  files: FileReport[]
  totalIssues: number
  totalScore: number
  totalFiles: number
  summary: {
    errors: number
    warnings: number
    infos: number
    byRule: Record<string, number>
  }
}

export interface AIOutput {
  summary: {
    score: number
    grade: string
    total_issues: number
    files_affected: number
    files_clean: number
  }
  priority_order: AIIssue[]
  context_for_ai: {
    project_type: string
    scan_path: string
    rules_detected: string[]
    recommended_action: string
  }
}

export interface AIIssue {
  rank: number
  file: string
  line: number
  rule: string
  severity: string
  message: string
  snippet: string
  fix_suggestion: string
  effort: 'low' | 'medium' | 'high'
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Layer definition for architectural boundary enforcement.
 */
export interface LayerDefinition {
  name: string
  patterns: string[]
  canImportFrom: string[]
}

/**
 * Module boundary definition for cross-boundary enforcement.
 */
export interface ModuleBoundary {
  name: string
  root: string
  allowedExternalImports?: string[]
}

/**
 * Optional project-level configuration for drift.
 * Place in drift.config.ts (or .js / .json) at the project root.
 */
export interface DriftConfig {
  layers?: LayerDefinition[]
  modules?: ModuleBoundary[]
}
