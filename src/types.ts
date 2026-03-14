import type { SourceFile } from 'ts-morph'

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
  quality: RepoQualityScore
  maintenanceRisk: MaintenanceRiskMetrics
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
  plugins?: string[]
  architectureRules?: {
    controllerNoDb?: boolean
    serviceNoHttp?: boolean
    maxFunctionLines?: number
  }
}

export interface PluginRuleContext {
  projectRoot: string
  filePath: string
  config?: DriftConfig
}

export interface DriftPluginRule {
  name: string
  severity?: DriftIssue['severity']
  weight?: number
  detect: (file: SourceFile, context: PluginRuleContext) => DriftIssue[]
}

export interface DriftPlugin {
  name: string
  rules: DriftPluginRule[]
}

export interface LoadedPlugin {
  id: string
  plugin: DriftPlugin
}

export interface PluginLoadError {
  pluginId: string
  message: string
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface FileDiff {
  path: string            // path relativo al project root
  scoreBefore: number
  scoreAfter: number
  scoreDelta: number      // positivo = empeoró (más deuda), negativo = mejoró
  newIssues: DriftIssue[]
  resolvedIssues: DriftIssue[]
}

export interface DriftDiff {
  baseRef: string         // git ref del baseline (e.g. "HEAD~1", "main")
  projectPath: string     // path absoluto del proyecto
  scannedAt: string       // ISO timestamp
  files: FileDiff[]       // solo archivos con cambios (delta != 0 o issues diff != 0)
  totalScoreBefore: number
  totalScoreAfter: number
  totalDelta: number      // positivo = más deuda, negativo = menos deuda
  newIssuesCount: number
  resolvedIssuesCount: number
}

/** Historical analysis data for a single commit */
export interface HistoricalAnalysis {
  commitHash: string;
  commitDate: Date;
  author: string;
  message: string;
  files: FileReport[];
  totalScore: number;
  averageScore: number;
}

/** Trend data point for score evolution */
export interface TrendDataPoint {
  date: Date;
  score: number;
  fileCount: number;
  avgIssuesPerFile: number;
}

/** Blame attribution data */
export interface BlameAttribution {
  author: string;
  email: string;
  commits: number;
  linesChanged: number;
  issuesIntroduced: number;
  avgScoreImpact: number;
}

/** Extended DriftReport with historical context */
export interface DriftTrendReport extends DriftReport {
  trend: TrendDataPoint[];
  regression: {
    slope: number;
    intercept: number;
    r2: number;
  };
}

/** Extended DriftReport with blame data */
export interface DriftBlameReport extends DriftReport {
  blame: BlameAttribution[];
}
