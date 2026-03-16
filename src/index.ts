export { analyzeProject, analyzeFile, RULE_WEIGHTS } from './analyzer.js'
export { buildReport, formatMarkdown } from './reporter.js'
export { computeDiff } from './diff.js'
export { generateReview, formatReviewMarkdown } from './review.js'
export {
  buildTrustReport,
  formatTrustConsole,
  formatTrustMarkdown,
  formatTrustJson,
  shouldFailByMaxRisk,
  shouldFailTrustGate,
  normalizeMergeRiskLevel,
  MERGE_RISK_ORDER,
} from './trust.js'
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
  MergeRiskLevel,
  DriftPlugin,
  DriftPluginRule,
} from './types.js'
export { loadHistory, saveSnapshot } from './snapshot.js'
export type { SnapshotEntry, SnapshotHistory } from './snapshot.js'
export {
  DEFAULT_SAAS_POLICY,
  defaultSaasStorePath,
  resolveSaasPolicy,
  ingestSnapshotFromReport,
  getSaasSummary,
  generateSaasDashboardHtml,
} from './saas.js'
export type {
  SaasPolicy,
  SaasStore,
  SaasSummary,
  SaasSnapshot,
  IngestOptions,
} from './saas.js'
