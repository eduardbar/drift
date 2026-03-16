import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { MERGE_RISK_ORDER, normalizeMergeRiskLevel } from './trust.js'
import type { DriftTrustReport, MergeRiskLevel, TrustDiffContext, TrustDiffTrendSummary, TrustKpiDiagnostic, TrustKpiReport } from './types.js'

interface ParsedTrustArtifact {
  filePath: string
  trustScore: number
  mergeRisk: MergeRiskLevel
  diffContext?: TrustDiffContext
}

interface DiscoverResult {
  files: string[]
  diagnostics: TrustKpiDiagnostic[]
}

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.next', 'build'])

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return round(sorted[mid])
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function listFilesRecursively(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const fullPath = resolve(current, entry)
      const info = statSync(fullPath)
      if (info.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry)) continue
        stack.push(fullPath)
      } else {
        out.push(fullPath)
      }
    }
  }

  return out
}

function isGlobPattern(input: string): boolean {
  return /[*?[\]{}]/.test(input)
}

function escapeRegex(char: string): string {
  return /[\\^$+?.()|{}\[\]]/.test(char) ? `\\${char}` : char
}

function globToRegex(pattern: string): RegExp {
  const normalized = toPosixPath(pattern)
  let expression = '^'

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const nextChar = normalized[index + 1]
    const nextNextChar = normalized[index + 2]

    if (char === '*' && nextChar === '*') {
      if (nextNextChar === '/') {
        expression += '(?:.*/)?'
        index += 2
        continue
      }
      expression += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      expression += '[^/]*'
      continue
    }

    if (char === '?') {
      expression += '[^/]'
      continue
    }

    expression += escapeRegex(char)
  }

  expression += '$'
  return new RegExp(expression)
}

function globBaseDir(pattern: string): string {
  const normalized = toPosixPath(pattern)
  const wildcardIndex = normalized.search(/[*?[\]{}]/)

  if (wildcardIndex < 0) return dirname(pattern)

  const prefix = normalized.slice(0, wildcardIndex)
  const slashIndex = prefix.lastIndexOf('/')

  if (slashIndex < 0) return '.'
  if (slashIndex === 0) return '/'

  return prefix.slice(0, slashIndex)
}

function discoverTrustJsonFiles(input: string, cwd: string): DiscoverResult {
  const diagnostics: TrustKpiDiagnostic[] = []
  const source = input.trim() || '.'

  if (isGlobPattern(source)) {
    const absolutePattern = isAbsolute(source) ? source : resolve(cwd, source)
    const regex = globToRegex(toPosixPath(absolutePattern))
    const base = resolve(cwd, globBaseDir(source))

    if (!existsSync(base)) {
      diagnostics.push({
        level: 'error',
        code: 'path-not-found',
        message: `Glob base path does not exist: ${base}`,
      })
      return { files: [], diagnostics }
    }

    const matched = listFilesRecursively(base)
      .filter((filePath) => regex.test(toPosixPath(filePath)))
      .filter((filePath) => filePath.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b))

    return { files: matched, diagnostics }
  }

  const absolute = isAbsolute(source) ? source : resolve(cwd, source)
  if (!existsSync(absolute)) {
    diagnostics.push({
      level: 'error',
      code: 'path-not-found',
      message: `Path does not exist: ${absolute}`,
    })
    return { files: [], diagnostics }
  }

  const info = statSync(absolute)
  if (info.isDirectory()) {
    const files = listFilesRecursively(absolute)
      .filter((filePath) => filePath.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b))
    return { files, diagnostics }
  }

  if (info.isFile()) {
    if (!absolute.toLowerCase().endsWith('.json')) {
      diagnostics.push({
        level: 'warning',
        code: 'path-not-supported',
        file: absolute,
        message: 'Input file is not JSON; attempting to parse anyway',
      })
    }
    return { files: [absolute], diagnostics }
  }

  diagnostics.push({
    level: 'error',
    code: 'path-not-supported',
    message: `Path is neither a file nor directory: ${absolute}`,
  })

  return { files: [], diagnostics }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeDiffContext(raw: unknown): { diffContext?: TrustDiffContext; diagnostic?: TrustKpiDiagnostic } {
  if (!isObjectLike(raw)) {
    return {
      diagnostic: {
        level: 'warning',
        code: 'invalid-diff-context',
        message: 'diff_context is present but malformed; skipping diff trend fields for this artifact',
      },
    }
  }

  const baseRef = typeof raw.baseRef === 'string' ? raw.baseRef : 'unknown'
  const status = raw.status
  const scoreDelta = typeof raw.scoreDelta === 'number' && Number.isFinite(raw.scoreDelta) ? raw.scoreDelta : null
  const newIssues = typeof raw.newIssues === 'number' && Number.isFinite(raw.newIssues) ? raw.newIssues : null
  const resolvedIssues = typeof raw.resolvedIssues === 'number' && Number.isFinite(raw.resolvedIssues) ? raw.resolvedIssues : null
  const filesChanged = typeof raw.filesChanged === 'number' && Number.isFinite(raw.filesChanged) ? raw.filesChanged : 0
  const penalty = typeof raw.penalty === 'number' && Number.isFinite(raw.penalty) ? raw.penalty : 0
  const bonus = typeof raw.bonus === 'number' && Number.isFinite(raw.bonus) ? raw.bonus : 0
  const netImpact = typeof raw.netImpact === 'number' && Number.isFinite(raw.netImpact) ? raw.netImpact : 0

  if (scoreDelta == null || newIssues == null || resolvedIssues == null) {
    return {
      diagnostic: {
        level: 'warning',
        code: 'invalid-diff-context',
        message: 'diff_context is missing numeric scoreDelta/newIssues/resolvedIssues; skipping diff trend fields for this artifact',
      },
    }
  }

  const normalizedStatus = status === 'improved' || status === 'regressed' || status === 'neutral'
    ? status
    : scoreDelta < 0
      ? 'improved'
      : scoreDelta > 0
        ? 'regressed'
        : 'neutral'

  return {
    diffContext: {
      baseRef,
      status: normalizedStatus,
      scoreDelta,
      newIssues,
      resolvedIssues,
      filesChanged,
      penalty,
      bonus,
      netImpact,
    },
  }
}

function parseTrustArtifact(filePath: string): { record?: ParsedTrustArtifact; diagnostics: TrustKpiDiagnostic[] } {
  const diagnostics: TrustKpiDiagnostic[] = []

  let rawContent = ''
  try {
    rawContent = readFileSync(filePath, 'utf8')
  } catch (error) {
    diagnostics.push({
      level: 'error',
      code: 'read-failed',
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    })
    return { diagnostics }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (error) {
    diagnostics.push({
      level: 'error',
      code: 'parse-failed',
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    })
    return { diagnostics }
  }

  if (!isObjectLike(parsed)) {
    diagnostics.push({
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: 'Trust artifact must be a JSON object',
    })
    return { diagnostics }
  }

  const trustScore = parsed.trust_score
  if (typeof trustScore !== 'number' || !Number.isFinite(trustScore)) {
    diagnostics.push({
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: 'Missing numeric trust_score',
    })
    return { diagnostics }
  }

  const mergeRisk = typeof parsed.merge_risk === 'string'
    ? normalizeMergeRiskLevel(parsed.merge_risk)
    : undefined

  if (!mergeRisk) {
    diagnostics.push({
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: `Missing/invalid merge_risk (expected one of ${MERGE_RISK_ORDER.join(', ')})`,
    })
    return { diagnostics }
  }

  let diffContext: TrustDiffContext | undefined
  if (parsed.diff_context !== undefined) {
    const normalized = normalizeDiffContext(parsed.diff_context)
    if (normalized.diagnostic) {
      diagnostics.push({ ...normalized.diagnostic, file: filePath })
    } else {
      diffContext = normalized.diffContext
    }
  }

  return {
    record: {
      filePath,
      trustScore,
      mergeRisk,
      diffContext,
    },
    diagnostics,
  }
}

function buildDiffTrend(records: ParsedTrustArtifact[]): TrustDiffTrendSummary {
  const withDiff = records.filter((record) => record.diffContext)

  if (withDiff.length === 0) {
    return {
      available: false,
      samples: 0,
      statusDistribution: {
        improved: 0,
        regressed: 0,
        neutral: 0,
      },
      scoreDelta: {
        average: null,
        median: null,
      },
      issues: {
        newTotal: 0,
        resolvedTotal: 0,
        netNew: 0,
      },
    }
  }

  const scoreDeltas = withDiff.map((record) => record.diffContext!.scoreDelta)
  const newIssues = withDiff.reduce((sum, record) => sum + record.diffContext!.newIssues, 0)
  const resolvedIssues = withDiff.reduce((sum, record) => sum + record.diffContext!.resolvedIssues, 0)

  const statusDistribution = {
    improved: withDiff.filter((record) => record.diffContext!.status === 'improved').length,
    regressed: withDiff.filter((record) => record.diffContext!.status === 'regressed').length,
    neutral: withDiff.filter((record) => record.diffContext!.status === 'neutral').length,
  }

  return {
    available: true,
    samples: withDiff.length,
    statusDistribution,
    scoreDelta: {
      average: average(scoreDeltas),
      median: median(scoreDeltas),
    },
    issues: {
      newTotal: newIssues,
      resolvedTotal: resolvedIssues,
      netNew: newIssues - resolvedIssues,
    },
  }
}

export interface TrustKpiOptions {
  cwd?: string
}

export function computeTrustKpis(input: string, options?: TrustKpiOptions): TrustKpiReport {
  const cwd = options?.cwd ?? process.cwd()
  const discovered = discoverTrustJsonFiles(input, cwd)

  const records: ParsedTrustArtifact[] = []
  const diagnostics = [...discovered.diagnostics]

  for (const filePath of discovered.files) {
    const parsed = parseTrustArtifact(filePath)
    diagnostics.push(...parsed.diagnostics)
    if (parsed.record) records.push(parsed.record)
  }

  const trustScores = records.map((record) => record.trustScore)
  const mergeRiskDistribution: Record<MergeRiskLevel, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  }

  for (const record of records) {
    mergeRiskDistribution[record.mergeRisk] += 1
  }

  const highRiskCount = mergeRiskDistribution.HIGH + mergeRiskDistribution.CRITICAL

  return {
    generatedAt: new Date().toISOString(),
    input,
    files: {
      matched: discovered.files.length,
      parsed: records.length,
      malformed: discovered.files.length - records.length,
    },
    prsEvaluated: records.length,
    mergeRiskDistribution,
    trustScore: {
      average: average(trustScores),
      median: median(trustScores),
      min: trustScores.length > 0 ? Math.min(...trustScores) : null,
      max: trustScores.length > 0 ? Math.max(...trustScores) : null,
    },
    highRiskRatio: records.length > 0 ? round(highRiskCount / records.length, 4) : null,
    diffTrend: buildDiffTrend(records),
    diagnostics,
  }
}

export function formatTrustKpiConsole(kpi: TrustKpiReport): string {
  const parts = [
    'drift kpi',
    '',
    `Input: ${kpi.input}`,
    `Files matched: ${kpi.files.matched} | parsed: ${kpi.files.parsed} | malformed: ${kpi.files.malformed}`,
    `PRs evaluated: ${kpi.prsEvaluated}`,
    `Trust score (avg/median): ${kpi.trustScore.average ?? 'n/a'} / ${kpi.trustScore.median ?? 'n/a'}`,
    `High-risk ratio (HIGH+CRITICAL): ${kpi.highRiskRatio == null ? 'n/a' : `${round(kpi.highRiskRatio * 100, 2)}%`}`,
    `Merge risk distribution: LOW=${kpi.mergeRiskDistribution.LOW} MEDIUM=${kpi.mergeRiskDistribution.MEDIUM} HIGH=${kpi.mergeRiskDistribution.HIGH} CRITICAL=${kpi.mergeRiskDistribution.CRITICAL}`,
  ]

  if (kpi.diffTrend.available) {
    const avgDelta = kpi.diffTrend.scoreDelta.average
    const signedDelta = avgDelta == null ? 'n/a' : `${avgDelta >= 0 ? '+' : ''}${avgDelta}`
    parts.push(
      `Diff trend samples: ${kpi.diffTrend.samples} | avg score delta: ${signedDelta} | new/resolved: +${kpi.diffTrend.issues.newTotal}/-${kpi.diffTrend.issues.resolvedTotal}`,
    )
  } else {
    parts.push('Diff trend samples: 0 (no diff_context found)')
  }

  if (kpi.diagnostics.length > 0) {
    const errorCount = kpi.diagnostics.filter((diagnostic) => diagnostic.level === 'error').length
    const warningCount = kpi.diagnostics.filter((diagnostic) => diagnostic.level === 'warning').length
    parts.push(`Diagnostics: ${errorCount} error(s), ${warningCount} warning(s)`) 
  }

  return parts.join('\n')
}

export function formatTrustKpiJson(kpi: TrustKpiReport): string {
  return JSON.stringify(kpi, null, 2)
}

export function computeTrustKpisFromReports(reports: DriftTrustReport[]): TrustKpiReport {
  const tempRecords: ParsedTrustArtifact[] = reports.reduce<ParsedTrustArtifact[]>((acc, report, index) => {
      const mergeRisk = normalizeMergeRiskLevel(report.merge_risk)
      if (!mergeRisk || typeof report.trust_score !== 'number') return acc
      acc.push({
        filePath: `report-${index + 1}`,
        trustScore: report.trust_score,
        mergeRisk,
        diffContext: report.diff_context,
      })
      return acc
    }, [])

  const trustScores = tempRecords.map((record) => record.trustScore)
  const mergeRiskDistribution: Record<MergeRiskLevel, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  }

  for (const record of tempRecords) {
    mergeRiskDistribution[record.mergeRisk] += 1
  }

  const highRiskCount = mergeRiskDistribution.HIGH + mergeRiskDistribution.CRITICAL

  return {
    generatedAt: new Date().toISOString(),
    input: 'in-memory',
    files: {
      matched: reports.length,
      parsed: tempRecords.length,
      malformed: reports.length - tempRecords.length,
    },
    prsEvaluated: tempRecords.length,
    mergeRiskDistribution,
    trustScore: {
      average: average(trustScores),
      median: median(trustScores),
      min: trustScores.length > 0 ? Math.min(...trustScores) : null,
      max: trustScores.length > 0 ? Math.max(...trustScores) : null,
    },
    highRiskRatio: tempRecords.length > 0 ? round(highRiskCount / tempRecords.length, 4) : null,
    diffTrend: buildDiffTrend(tempRecords),
    diagnostics: [],
  }
}
