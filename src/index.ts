export { analyzeProject, analyzeFile, RULE_WEIGHTS } from './analyzer.js'
export { buildReport, formatMarkdown } from './reporter.js'
export { computeDiff } from './diff.js'
export { runGuard, evaluateGuard } from './guard.js'
export type {
  GuardBaseline,
  GuardThresholds,
  GuardOptions,
  GuardMetrics,
  GuardCheck,
  GuardEvaluation,
  GuardResult,
} from './guard-types.js'
export { generateReview, formatReviewMarkdown } from './review.js'
export { runDoctor } from './doctor.js'
export type { DoctorOptions } from './doctor.js'
export {
  buildTrustReport,
  formatTrustConsole,
  formatTrustMarkdown,
  formatTrustJsonObject,
  formatTrustJson,
  resolveTrustGatePolicy,
  evaluateTrustGate,
  shouldFailByMaxRisk,
  shouldFailTrustGate,
  normalizeMergeRiskLevel,
  MERGE_RISK_ORDER,
} from './trust.js'
export type {
  TrustGateOptions,
  TrustGatePolicyResolutionOptions,
  TrustGatePolicyResolutionStep,
  TrustGateEvaluation,
} from './trust.js'
export {
  computeTrustKpis,
  computeTrustKpisFromReports,
  formatTrustKpiConsole,
  formatTrustKpiJson,
} from './trust-kpi.js'
export { toSarif, diffToSarif } from './sarif.js'
export type {
  SarifLevel,
  DriftSarifRule,
  DriftSarifResult,
  DriftSarifRun,
  DriftSarifLog,
} from './sarif.js'
export { generateArchitectureMap, generateArchitectureSvg } from './map.js'
export type {
  DriftReport,
  FileReport,
  DriftIssue,
  DriftDiff,
  FileDiff,
  DriftConfig,
  RepoQualityScore,
  MaintenanceRiskMetrics,
  DriftTrustReport,
  TrustReason,
  TrustFixPriority,
  TrustDiffContext,
  TrustKpiReport,
  TrustKpiDiagnostic,
  TrustDiffTrendSummary,
  TrustScoreStats,
  MergeRiskLevel,
  DriftPlugin,
  DriftPluginRule,
  TrustGatePolicyConfig,
  TrustAdvancedContext,
} from './types.js'
export { loadHistory, saveSnapshot } from './snapshot.js'
export type { SnapshotEntry, SnapshotHistory } from './snapshot.js'
export {
  DEFAULT_SAAS_POLICY,
  defaultSaasStorePath,
  resolveSaasPolicy,
  SaasActorRequiredError,
  SaasPermissionError,
  getRequiredRoleForOperation,
  assertSaasPermission,
  getSaasEffectiveLimits,
  getOrganizationEffectiveLimits,
  changeOrganizationPlan,
  listOrganizationPlanChanges,
  getOrganizationUsageSnapshot,
  ingestSnapshotFromReport,
  listSaasSnapshots,
  getSaasSummary,
  generateSaasDashboardHtml,
} from './saas.js'
export type {
  SaasUser,
  SaasOrganization,
  SaasWorkspace,
  SaasRepo,
  SaasMembership,
  SaasRole,
  SaasPlan,
  SaasPolicy,
  SaasPolicyOverrides,
  SaasStore,
  SaasSummary,
  SaasSnapshot,
  SaasQueryOptions,
  IngestOptions,
  SaasPlanChange,
  SaasOperation,
  SaasPermissionContext,
  SaasPermissionResult,
  SaasEffectiveLimits,
  SaasOrganizationUsageSnapshot,
  ChangeOrganizationPlanOptions,
  SaasUsageQueryOptions,
  SaasPlanChangeQueryOptions,
} from './saas.js'
