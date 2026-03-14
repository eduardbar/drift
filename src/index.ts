export { analyzeProject, analyzeFile, RULE_WEIGHTS } from './analyzer.js'
export { buildReport, formatMarkdown } from './reporter.js'
export { computeDiff } from './diff.js'
export { generateReview, formatReviewMarkdown } from './review.js'
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
  DriftPlugin,
  DriftPluginRule,
} from './types.js'
export { loadHistory, saveSnapshot } from './snapshot.js'
export type { SnapshotEntry, SnapshotHistory } from './snapshot.js'
