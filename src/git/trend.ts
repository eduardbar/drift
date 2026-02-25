// drift-ignore-file

import type { FileReport, DriftConfig, TrendDataPoint, DriftTrendReport } from '../types.js'
import { assertGitRepo, analyzeHistoricalCommits } from './helpers.js'
import { buildReport } from '../reporter.js'

export class TrendAnalyzer {
  private readonly projectPath: string
  private readonly config: DriftConfig | undefined
  private readonly analyzeProjectFn: (targetPath: string, config?: DriftConfig) => FileReport[]

  constructor(
    projectPath: string,
    analyzeProjectFn: (targetPath: string, config?: DriftConfig) => FileReport[],
    config?: DriftConfig,
  ) {
    this.projectPath = projectPath
    this.analyzeProjectFn = analyzeProjectFn
    this.config = config
  }

  // --- Static utility methods -----------------------------------------------

  static calculateMovingAverage(data: TrendDataPoint[], windowSize: number): number[] {
    return data.map((_, i) => {
      const start = Math.max(0, i - windowSize + 1)
      const window = data.slice(start, i + 1)
      return window.reduce((s, p) => s + p.score, 0) / window.length
    })
  }

  static linearRegression(data: TrendDataPoint[]): { slope: number; intercept: number; r2: number } {
    const n = data.length
    if (n < 2) return { slope: 0, intercept: data[0]?.score ?? 0, r2: 0 }

    const xs = data.map((_, i) => i)
    const ys = data.map(p => p.score)

    const xMean = xs.reduce((s, x) => s + x, 0) / n
    const yMean = ys.reduce((s, y) => s + y, 0) / n

    const ssXX = xs.reduce((s, x) => s + (x - xMean) ** 2, 0)
    const ssXY = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i]! - yMean), 0)
    const ssYY = ys.reduce((s, y) => s + (y - yMean) ** 2, 0)

    const slope = ssXX === 0 ? 0 : ssXY / ssXX
    const intercept = yMean - slope * xMean
    const r2 = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY)

    return { slope, intercept, r2 }
  }

  /** Generate a simple horizontal ASCII bar chart (one bar per data point). */
  static generateTrendChart(data: TrendDataPoint[]): string {
    if (data.length === 0) return '(no data)'

    const maxScore = Math.max(...data.map(p => p.score), 1)
    const chartWidth = 40

    const lines = data.map(p => {
      const barLen = Math.round((p.score / maxScore) * chartWidth)
      const bar = '█'.repeat(barLen)
      const dateStr = p.date.toISOString().slice(0, 10)
      return `${dateStr} │${bar.padEnd(chartWidth)} ${p.score.toFixed(1)}`
    })

    return lines.join('\n')
  }

  // --- Instance method -------------------------------------------------------

  async analyzeTrend(options: {
    period?: 'week' | 'month' | 'quarter' | 'year'
    since?: string
    until?: string
  }): Promise<DriftTrendReport> {
    assertGitRepo(this.projectPath)

    const periodDays: Record<string, number> = {
      week: 7, month: 30, quarter: 90, year: 365,
    }
    const days = periodDays[options.period ?? 'month'] ?? 30
    const sinceDate = options.since
      ? new Date(options.since)
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const historicalAnalyses = await analyzeHistoricalCommits(
      sinceDate,
      this.projectPath,
      100,
      this.analyzeProjectFn,
      this.config,
      10,
    )

    const trendPoints: TrendDataPoint[] = historicalAnalyses.map(h => ({
      date: h.commitDate,
      score: h.averageScore,
      fileCount: h.files.length,
      avgIssuesPerFile: h.files.length > 0
        ? h.files.reduce((s, f) => s + f.issues.length, 0) / h.files.length
        : 0,
    }))

    const regression = TrendAnalyzer.linearRegression(trendPoints)

    // Current state report
    const currentFiles = this.analyzeProjectFn(this.projectPath, this.config)
    const baseReport = buildReport(this.projectPath, currentFiles)

    return {
      ...baseReport,
      trend: trendPoints,
      regression,
    }
  }
}
