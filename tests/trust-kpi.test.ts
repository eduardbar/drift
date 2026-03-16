import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeTrustKpis } from '../src/trust-kpi.js'

describe('trust KPI aggregation', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  })

  it('aggregates trust KPIs and diff trends from JSON artifacts', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'drift-kpi-aggregate-'))

    writeFileSync(join(tempDir, 'trust-a.json'), JSON.stringify({
      trust_score: 80,
      merge_risk: 'LOW',
      diff_context: {
        baseRef: 'origin/main',
        status: 'improved',
        scoreDelta: -5,
        newIssues: 1,
        resolvedIssues: 3,
        filesChanged: 2,
        penalty: 0,
        bonus: 7,
        netImpact: -7,
      },
    }, null, 2))

    writeFileSync(join(tempDir, 'trust-b.json'), JSON.stringify({
      trust_score: 60,
      merge_risk: 'MEDIUM',
      diff_context: {
        baseRef: 'origin/main',
        status: 'regressed',
        scoreDelta: 8,
        newIssues: 4,
        resolvedIssues: 1,
        filesChanged: 3,
        penalty: 9,
        bonus: 0,
        netImpact: 9,
      },
    }, null, 2))

    writeFileSync(join(tempDir, 'trust-c.json'), JSON.stringify({
      trust_score: 30,
      merge_risk: 'HIGH',
    }, null, 2))

    const kpi = computeTrustKpis(tempDir)

    expect(kpi.files).toEqual({ matched: 3, parsed: 3, malformed: 0 })
    expect(kpi.prsEvaluated).toBe(3)
    expect(kpi.mergeRiskDistribution).toEqual({ LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 0 })
    expect(kpi.highRiskRatio).toBe(0.3333)
    expect(kpi.trustScore).toEqual({ average: 56.67, median: 60, min: 30, max: 80 })

    expect(kpi.diffTrend.available).toBe(true)
    expect(kpi.diffTrend.samples).toBe(2)
    expect(kpi.diffTrend.statusDistribution).toEqual({ improved: 1, regressed: 1, neutral: 0 })
    expect(kpi.diffTrend.scoreDelta).toEqual({ average: 1.5, median: 1.5 })
    expect(kpi.diffTrend.issues).toEqual({ newTotal: 5, resolvedTotal: 4, netNew: 1 })
    expect(kpi.diagnostics).toEqual([])
  })

  it('keeps parsing resilient and reports diagnostics for malformed artifacts', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'drift-kpi-parse-'))

    writeFileSync(join(tempDir, 'valid.json'), JSON.stringify({
      trust_score: 70,
      merge_risk: 'MEDIUM',
      diff_context: {
        scoreDelta: 2,
        newIssues: 3,
        resolvedIssues: 1,
      },
    }, null, 2))

    writeFileSync(join(tempDir, 'broken.json'), '{"trust_score":70')
    writeFileSync(join(tempDir, 'invalid-shape.json'), JSON.stringify({ trust_score: 70 }, null, 2))
    writeFileSync(join(tempDir, 'bad-diff.json'), JSON.stringify({
      trust_score: 50,
      merge_risk: 'HIGH',
      diff_context: 'oops',
    }, null, 2))

    const kpi = computeTrustKpis(tempDir)

    expect(kpi.files.matched).toBe(4)
    expect(kpi.files.parsed).toBe(2)
    expect(kpi.files.malformed).toBe(2)
    expect(kpi.prsEvaluated).toBe(2)

    const byCode = new Set(kpi.diagnostics.map((diagnostic) => diagnostic.code))
    expect(byCode.has('parse-failed')).toBe(true)
    expect(byCode.has('invalid-shape')).toBe(true)
    expect(byCode.has('invalid-diff-context')).toBe(true)
  })

  it('supports glob input selection for trust artifacts', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'drift-kpi-glob-'))
    mkdirSync(join(tempDir, 'nested'))

    writeFileSync(join(tempDir, 'trust-1.json'), JSON.stringify({ trust_score: 90, merge_risk: 'LOW' }))
    writeFileSync(join(tempDir, 'nested', 'trust-2.json'), JSON.stringify({ trust_score: 20, merge_risk: 'CRITICAL' }))
    writeFileSync(join(tempDir, 'other.json'), JSON.stringify({ trust_score: 55, merge_risk: 'MEDIUM' }))

    const pattern = join(tempDir, '**', 'trust-*.json')
    const kpi = computeTrustKpis(pattern)

    expect(kpi.files).toEqual({ matched: 2, parsed: 2, malformed: 0 })
    expect(kpi.mergeRiskDistribution).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 0, CRITICAL: 1 })
    expect(kpi.trustScore.average).toBe(55)
  })
})
