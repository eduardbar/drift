import { relative, resolve } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { loadConfig } from './config.js'
import { computeDiff } from './diff.js'
import { cleanupTempDir, extractFilesAtRef } from './git.js'
import { normalizeBaseline, readBaselineFromFile } from './guard-baseline.js'
import { buildMetricsFromBaseline, buildMetricsFromDiff } from './guard-metrics.js'
import { buildReport } from './reporter.js'
import type { DriftReport } from './types.js'
import type {
  GuardCheck,
  GuardEvaluation,
  GuardMetrics,
  GuardOptions,
  GuardResult,
  GuardThresholds,
  IssueSeverity,
} from './guard-types.js'
import type { NormalizedBaseline } from './guard-baseline.js'

interface GuardEvalInput {
  metrics: GuardMetrics
  budget?: number
  bySeverity?: GuardThresholds
  enforceNoRegression: {
    score: boolean
    totalIssues: boolean
  }
}

interface GuardRuntimeState {
  currentReport: DriftReport
  config: Awaited<ReturnType<typeof loadConfig>>
  projectPath: string
}

interface DiffGuardResultInput {
  projectPath: string
  currentReport: DriftReport
  options: GuardOptions
  tempDir: string
  config: Awaited<ReturnType<typeof loadConfig>>
  baseRef: string
}

interface BaselineGuardResultInput {
  projectPath: string
  currentReport: DriftReport
  options: GuardOptions
  baseline: NormalizedBaseline
  baselinePath?: string
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


interface GuardCheckInput {
  id: string
  actual: number
  limit: number
  message: string
}

function addCheck(checks: GuardCheck[], input: GuardCheckInput): void {
  checks.push({
    id: input.id,
    passed: input.actual <= input.limit,
    actual: input.actual,
    limit: input.limit,
    message: input.message,
  })
}

export function evaluateGuard(input: GuardEvalInput): GuardEvaluation {
  const checks: GuardCheck[] = []

  if (input.enforceNoRegression.score) {
    addCheck(checks, {
      id: 'no-regression-score',
      actual: input.metrics.scoreDelta,
      limit: 0,
      message: 'Score delta must be <= 0.',
    })
  }

  if (input.enforceNoRegression.totalIssues) {
    addCheck(checks, {
      id: 'no-regression-total-issues',
      actual: input.metrics.totalIssuesDelta,
      limit: 0,
      message: 'Total issues delta must be <= 0.',
    })
  }

  if (typeof input.budget === 'number' && !Number.isNaN(input.budget)) {
    addCheck(checks, {
      id: 'budget-total-delta',
      actual: input.metrics.scoreDelta,
      limit: input.budget,
      message: `Score delta must be <= budget (${input.budget}).`,
    })
  }

  const severityThresholds = input.bySeverity
  if (severityThresholds) {
    const severities: IssueSeverity[] = ['error', 'warning', 'info']
    for (const severity of severities) {
      const threshold = severityThresholds[severity]
      if (typeof threshold !== 'number' || Number.isNaN(threshold)) continue
      addCheck(checks, {
        id: `severity-${severity}`,
        actual: input.metrics.severityDelta[severity],
        limit: threshold,
        message: `${severity} delta must be <= ${threshold}.`,
      })
    }
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
  }
}

export async function runGuard(targetPath: string, options: GuardOptions = {}): Promise<GuardResult> {
  const runtimeState = await initializeGuardRuntime(targetPath, options)
  const { projectPath, config, currentReport } = runtimeState

  let tempDir: string | undefined
  try {
    if (options.baseRef) {
      tempDir = extractFilesAtRef(projectPath, options.baseRef)
      return createDiffGuardResult({
        projectPath,
        currentReport,
        options,
        tempDir,
        config,
        baseRef: options.baseRef,
      })
    }

    const inlineBaseline = options.baseline ? normalizeBaseline(options.baseline) : undefined
    const fileBaseline = inlineBaseline ? undefined : readBaselineFromFile(projectPath, options.baselinePath)
    const baseline = inlineBaseline ?? fileBaseline?.baseline
    const baselinePath = fileBaseline?.path

    if (!baseline) {
      throw new Error('Guard requires a comparison point: provide baseRef or a baseline (inline or file).')
    }

    return createBaselineGuardResult({
      projectPath,
      currentReport,
      options,
      baseline,
      baselinePath,
    })
  } finally {
    if (tempDir) cleanupTempDir(tempDir)
  }
}

async function initializeGuardRuntime(targetPath: string, options: GuardOptions): Promise<GuardRuntimeState> {
  const projectPath = resolve(targetPath)
  const config = await loadConfig(projectPath)
  const currentFiles = analyzeProject(projectPath, config, options.analysis)
  const currentReport = buildReport(projectPath, currentFiles)

  return {
    projectPath,
    config,
    currentReport,
  }
}

function createDiffGuardResult(input: DiffGuardResultInput): GuardResult {
  const { projectPath, currentReport, options, tempDir, config, baseRef } = input
  const baseFiles = analyzeProject(tempDir, config, options.analysis)
  const baseReport = buildReport(tempDir, baseFiles)
  const remappedBase = remapBaseReportPaths(baseReport, tempDir, projectPath)
  const diff = computeDiff(remappedBase, currentReport, baseRef)
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
    baseRef,
    metrics,
    checks: evaluation.checks,
    current: currentReport,
    diff,
  }
}

function createBaselineGuardResult(input: BaselineGuardResultInput): GuardResult {
  const { projectPath, currentReport, options, baseline, baselinePath } = input
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
}
