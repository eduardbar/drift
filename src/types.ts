// drift-ignore-file
export type {
  DriftIssue,
  FileReport,
  RepoQualityScore,
  RiskHotspot,
  MaintenanceRiskMetrics,
  AIIssue,
  AIOutput,
  AIOutputJson,
  DriftReport,
  DriftReportJson,
  DriftOutputMetadata,
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
  DriftTrustReportJson,
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

export type {
  GuardBaseline,
  GuardThresholds,
  GuardOptions,
  GuardMetrics,
  GuardCheck,
  GuardEvaluation,
  GuardResult,
} from './guard.js'

export type {
  SarifLevel,
  DriftSarifRule,
  DriftSarifResult,
  DriftSarifRun,
  DriftSarifLog,
} from './sarif.js'
