import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { loadConfig } from './config.js'
import { computeDiff } from './diff.js'
import { cleanupTempDir, extractFilesAtRef } from './git.js'
import { buildReport } from './reporter.js'
import type { DriftAnalysisOptions, DriftDiff, DriftIssue, DriftReport } from './types.js'

type IssueSeverity = DriftIssue['severity']

export interface GuardBaseline {
  score?: number
  totalIssues?: number
  errors?: number
  warnings?: number
  infos?: number
  bySeverity?: Partial<Record<IssueSeverity, number>>
  summary?: {
    errors?: number
    warnings?: number
    infos?: number
  }
}

export interface GuardThresholds {
  error?: number
  warning?: number
  info?: number
}

export interface GuardOptions {
  baseRef?: string
  baselinePath?: string
  baseline?: GuardBaseline
  budget?: number
  bySeverity?: GuardThresholds
  analysis?: DriftAnalysisOptions
}

export interface GuardMetrics {
  scoreDelta: number
  totalIssuesDelta: number
  severityDelta: Record<IssueSeverity, number>
}

export interface GuardCheck {
  id: string
  passed: boolean
  actual: number
  limit: number
  message: string
}

export interface GuardEvaluation {
  passed: boolean
  checks: GuardCheck[]
}

export interface GuardResult {
  scannedAt: string
  projectPath: string
  mode: 'diff' | 'baseline'
  passed: boolean
  baseRef?: string
  baselinePath?: string
  metrics: GuardMetrics
  checks: GuardCheck[]
  current: DriftReport
  diff?: DriftDiff
}

interface NormalizedBaseline {
  score?: number
  totalIssues?: number
  bySeverity: Partial<Record<IssueSeverity, number>>
}

interface GuardEvalInput {
  metrics: GuardMetrics
  budget?: number
  bySeverity?: GuardThresholds
  enforceNoRegression: {
    score: boolean
    totalIssues: boolean
  }
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined
}

function normalizeBaseline(baseline: GuardBaseline): NormalizedBaseline {
  const bySeverityFromRoot = baseline.bySeverity
  const bySeverity = {
    error: parseNumber(bySeverityFromRoot?.error) ?? parseNumber(baseline.errors) ?? parseNumber(baseline.summary?.errors),
    warning: parseNumber(bySeverityFromRoot?.warning) ?? parseNumber(baseline.warnings) ?? parseNumber(baseline.summary?.warnings),
    info: parseNumber(bySeverityFromRoot?.info) ?? parseNumber(baseline.infos) ?? parseNumber(baseline.summary?.infos),
  }

  const normalized: NormalizedBaseline = {
    score: parseNumber(baseline.score),
    totalIssues: parseNumber(baseline.totalIssues),
    bySeverity,
  }

  const hasAnyAnchor =
    normalized.score !== undefined ||
    normalized.totalIssues !== undefined ||
    normalized.bySeverity.error !== undefined ||
    normalized.bySeverity.warning !== undefined ||
    normalized.bySeverity.info !== undefined

  if (!hasAnyAnchor) {
    throw new Error('Invalid guard baseline: expected score, totalIssues, or severity counters (error/warning/info).')
  }

  return normalized
}

function readBaselineFromFile(projectPath: string, baselinePath?: string): { baseline: NormalizedBaseline; path: string } | undefined {
  const resolvedBaselinePath = resolve(projectPath, baselinePath ?? 'drift-baseline.json')
  if (!existsSync(resolvedBaselinePath)) return undefined

  const raw = JSON.parse(readFileSync(resolvedBaselinePath, 'utf8')) as GuardBaseline
  return {
    baseline: normalizeBaseline(raw),
    path: resolvedBaselinePath,
  }
}

function remapBaseReportPaths(baseReport: DriftReport, tempDir: string, projectPath: string): DriftReport {
  return {
    ...baseReport,
    files: baseReport.files.map((file) => ({
      ...file,
      path: resolve(projectPath, relative(tempDir, file.path)),
    })),
  }
}

function countSeverityDeltaFromDiff(diff: DriftDiff): Record<IssueSeverity, number> {
  const severityDelta: Record<IssueSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  }

  for (const file of diff.files) {
    for (const issue of file.newIssues) {
      severityDelta[issue.severity] += 1
    }
    for (const issue of file.resolvedIssues) {
      severityDelta[issue.severity] -= 1
    }
  }

  return severityDelta
}

function buildMetricsFromDiff(diff: DriftDiff): GuardMetrics {
  return {
    scoreDelta: diff.totalDelta,
    totalIssuesDelta: diff.newIssuesCount - diff.resolvedIssuesCount,
    severityDelta: countSeverityDeltaFromDiff(diff),
  }
}

function buildMetricsFromBaseline(current: DriftReport, baseline: NormalizedBaseline): GuardMetrics {
  return {
    scoreDelta: current.totalScore - (baseline.score ?? current.totalScore),
    totalIssuesDelta: current.totalIssues - (baseline.totalIssues ?? current.totalIssues),
    severityDelta: {
      error: current.summary.errors - (baseline.bySeverity.error ?? current.summary.errors),
      warning: current.summary.warnings - (baseline.bySeverity.warning ?? current.summary.warnings),
      info: current.summary.infos - (baseline.bySeverity.info ?? current.summary.infos),
    },
  }
}

function addCheck(checks: GuardCheck[], id: string, actual: number, limit: number, message: string): void {
  checks.push({
    id,
    passed: actual <= limit,
    actual,
    limit,
    message,
  })
}

export function evaluateGuard(input: GuardEvalInput): GuardEvaluation {
  const checks: GuardCheck[] = []

  if (input.enforceNoRegression.score) {
    addCheck(checks, 'no-regression-score', input.metrics.scoreDelta, 0, 'Score delta must be <= 0.')
  }

  if (input.enforceNoRegression.totalIssues) {
    addCheck(checks, 'no-regression-total-issues', input.metrics.totalIssuesDelta, 0, 'Total issues delta must be <= 0.')
  }

  if (typeof input.budget === 'number' && !Number.isNaN(input.budget)) {
    addCheck(checks, 'budget-total-delta', input.metrics.scoreDelta, input.budget, `Score delta must be <= budget (${input.budget}).`)
  }

  const severityThresholds = input.bySeverity
  if (severityThresholds) {
    const severities: IssueSeverity[] = ['error', 'warning', 'info']
    for (const severity of severities) {
      const threshold = severityThresholds[severity]
      if (typeof threshold !== 'number' || Number.isNaN(threshold)) continue
      addCheck(
        checks,
        `severity-${severity}`,
        input.metrics.severityDelta[severity],
        threshold,
        `${severity} delta must be <= ${threshold}.`,
      )
    }
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
  }
}

export async function runGuard(targetPath: string, options: GuardOptions = {}): Promise<GuardResult> {
  const projectPath = resolve(targetPath)
  const config = await loadConfig(projectPath)

  const currentFiles = analyzeProject(projectPath, config, options.analysis)
  const currentReport = buildReport(projectPath, currentFiles)

  let tempDir: string | undefined
  try {
    if (options.baseRef) {
      tempDir = extractFilesAtRef(projectPath, options.baseRef)
      const baseFiles = analyzeProject(tempDir, config, options.analysis)
      const baseReport = buildReport(tempDir, baseFiles)
      const remappedBase = remapBaseReportPaths(baseReport, tempDir, projectPath)
      const diff = computeDiff(remappedBase, currentReport, options.baseRef)
      const metrics = buildMetricsFromDiff(diff)
      const evaluation = evaluateGuard({
        metrics,
        budget: options.budget,
        bySeverity: options.bySeverity,
        enforceNoRegression: {
          score: true,
          totalIssues: true,
        },
      })

      return {
        scannedAt: new Date().toISOString(),
        projectPath,
        mode: 'diff',
        passed: evaluation.passed,
        baseRef: options.baseRef,
        metrics,
        checks: evaluation.checks,
        current: currentReport,
        diff,
      }
    }

    const inlineBaseline = options.baseline ? normalizeBaseline(options.baseline) : undefined
    const fileBaseline = inlineBaseline ? undefined : readBaselineFromFile(projectPath, options.baselinePath)
    const baseline = inlineBaseline ?? fileBaseline?.baseline
    const baselinePath = fileBaseline?.path

    if (!baseline) {
      throw new Error('Guard requires a comparison point: provide baseRef or a baseline (inline or file).')
    }

    const metrics = buildMetricsFromBaseline(currentReport, baseline)
    const evaluation = evaluateGuard({
      metrics,
      budget: options.budget,
      bySeverity: options.bySeverity,
      enforceNoRegression: {
        score: baseline.score !== undefined,
        totalIssues: baseline.totalIssues !== undefined,
      },
    })

    return {
      scannedAt: new Date().toISOString(),
      projectPath,
      mode: 'baseline',
      passed: evaluation.passed,
      baselinePath,
      metrics,
      checks: evaluation.checks,
      current: currentReport,
    }
  } finally {
    if (tempDir) cleanupTempDir(tempDir)
  }
}
