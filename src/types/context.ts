export interface ContextHealth {
  score: number
  grade: string
  totalIssues: number
  errors: number
  warnings: number
  infos: number
  filesAffected: number
  filesClean: number
}

export interface ContextViolation {
  rank: number
  file: string
  line: number
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
  snippet: string
  fixSuggestion: string
  effort: 'low' | 'medium' | 'high'
}

export interface ContextArchitectureSummary {
  layers: string[]
  modules: string[]
  circularDependencies: number
}

export interface ContextDocument {
  generatedAt: string
  driftVersion: string
  projectPath: string
  health: ContextHealth
  topViolations: ContextViolation[]
  architectureSummary: ContextArchitectureSummary
  guidelines: string[]
  recommendedActions: string[]
}

export interface ContextOptions {
  output?: string
  format?: 'markdown' | 'json'
  maxIssues?: number
  ci?: boolean
  watch?: boolean
}
