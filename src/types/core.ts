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
  score: number
}

export interface RepoQualityScore {
  overall: number
  dimensions: {
    architecture: number
    complexity: number
    'ai-patterns': number
    testing: number
  }
}

export interface RiskHotspot {
  file: string
  driftScore: number
  complexityIssues: number
  hasNearbyTests: boolean
  changeFrequency: number
  risk: number
  reasons: string[]
}

export interface MaintenanceRiskMetrics {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  hotspots: RiskHotspot[]
  signals: {
    highComplexityFiles: number
    filesWithoutNearbyTests: number
    frequentChangeFiles: number
  }
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
  quality: RepoQualityScore
  maintenanceRisk: MaintenanceRiskMetrics
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

export interface AIOutput {
  summary: {
    score: number
    grade: string
    total_issues: number
    files_affected: number
    files_clean: number
    ai_likelihood: number
    ai_code_smell_score: number
  }
  files_suspected: Array<{ path: string; ai_likelihood: number; triggers: string[] }>
  priority_order: AIIssue[]
  maintenance_risk: MaintenanceRiskMetrics
  quality: RepoQualityScore
  context_for_ai: {
    project_type: string
    scan_path: string
    rules_detected: string[]
    recommended_action: string
  }
}

export interface DriftOutputMetadata {
  $schema: string
  toolVersion: string
}

export type DriftReportJson = DriftReport & DriftOutputMetadata

export type AIOutputJson = AIOutput & DriftOutputMetadata
