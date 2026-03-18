import { normalizeMergeRiskLevel } from './trust.js'
import type { DriftTrustReport, MergeRiskLevel, TrustDiffTrendSummary, TrustKpiReport } from './types.js'
import { discoverTrustJsonFiles } from './trust-kpi-fs.js'
import { parseTrustArtifact } from './trust-kpi-parse.js'
import type { ParsedTrustArtifact, TrustKpiOptions } from './trust-kpi-types.js'

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

const KPI_RATIO_DECIMALS = 4

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
    highRiskRatio: records.length > 0 ? round(highRiskCount / records.length, KPI_RATIO_DECIMALS) : null,
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
    highRiskRatio: tempRecords.length > 0 ? round(highRiskCount / tempRecords.length, KPI_RATIO_DECIMALS) : null,
    diffTrend: buildDiffTrend(tempRecords),
    diagnostics: [],
  }
}
