export type {
  DriftIssue,
  FileReport,
  RepoQualityScore,
  RiskHotspot,
  MaintenanceRiskMetrics,
  AIIssue,
  AIOutput,
  DriftReport,
} from './types/core.js'

export type {
  MergeRiskLevel,
  TrustGatePolicyPreset,
  TrustGatePolicyPack,
  TrustGatePolicyConfig,
  TrustReason,
  TrustFixPriority,
  TrustAdvancedComparison,
  TrustAdvancedContext,
  TrustDiffContext,
  DriftTrustReport,
  TrustKpiDiagnostic,
  TrustScoreStats,
  TrustDiffTrendSummary,
  TrustKpiReport,
} from './types/trust.js'

export type {
  LayerDefinition,
  ModuleBoundary,
  DriftPerformanceConfig,
  DriftAnalysisOptions,
} from './types/config.js'

export type { DriftConfig } from './types/app.js'

export type {
  PluginRuleContext,
  DriftPluginRule,
  DriftPlugin,
  LoadedPlugin,
  PluginLoadError,
  PluginLoadWarning,
} from './types/plugin.js'

export type {
  FileDiff,
  DriftDiff,
  HistoricalAnalysis,
  TrendDataPoint,
  BlameAttribution,
  DriftTrendReport,
  DriftBlameReport,
} from './types/diff.js'
