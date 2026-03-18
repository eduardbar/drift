import { describe, expect, it } from 'vitest'
import {
  buildTrustReport,
  detectBranchName,
  evaluateTrustGate,
  formatTrustGatePolicyExplanation,
  explainTrustGatePolicy,
  formatTrustJson,
  formatTrustJsonObject,
  formatTrustMarkdown,
  normalizeMergeRiskLevel,
  renderTrustOutput,
  resolveTrustGatePolicy,
  shouldFailByMaxRisk,
  shouldFailTrustGate,
} from '../src/trust.js'
import type { DriftConfig, DriftDiff, DriftReport } from '../src/types.js'

function createBaseReport(overrides?: Partial<DriftReport>): DriftReport {
  return {
    scannedAt: new Date().toISOString(),
    targetPath: '/tmp/repo',
    files: [],
    totalIssues: 0,
    totalScore: 0,
    totalFiles: 0,
    summary: {
      errors: 0,
      warnings: 0,
      infos: 0,
      byRule: {},
    },
    quality: {
      overall: 100,
      dimensions: {
        architecture: 100,
        complexity: 100,
        'ai-patterns': 100,
        testing: 100,
      },
    },
    maintenanceRisk: {
      score: 0,
      level: 'low',
      hotspots: [],
      signals: {
        highComplexityFiles: 0,
        filesWithoutNearbyTests: 0,
        frequentChangeFiles: 0,
      },
    },
    ...overrides,
  }
}

describe('drift trust baseline', () => {
  it('builds trust report contract with required fields', () => {
    const report = createBaseReport({
      totalIssues: 8,
      totalScore: 52,
      summary: {
        errors: 2,
        warnings: 5,
        infos: 1,
        byRule: {
          'high-complexity': 2,
          'debug-leftover': 3,
          'layer-violation': 1,
        },
      },
      maintenanceRisk: {
        score: 70,
        level: 'high',
        hotspots: [{
          file: '/tmp/repo/src/api/user.ts',
          driftScore: 65,
          complexityIssues: 2,
          hasNearbyTests: false,
          changeFrequency: 9,
          risk: 82,
          reasons: ['high complexity signals'],
        }],
        signals: {
          highComplexityFiles: 1,
          filesWithoutNearbyTests: 1,
          frequentChangeFiles: 1,
        },
      },
    })

    const trust = buildTrustReport(report)
    expect(trust.trust_score).toBeGreaterThanOrEqual(0)
    expect(trust.trust_score).toBeLessThanOrEqual(100)
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(trust.merge_risk)
    expect(trust.top_reasons.length).toBeGreaterThan(0)
    expect(trust.fix_priorities.length).toBeGreaterThan(0)
    expect(trust.fix_priorities[0]?.rank).toBe(1)
  })

  it('includes architecture signal in top reasons when violations exist', () => {
    const report = createBaseReport({
      totalScore: 25,
      summary: {
        errors: 1,
        warnings: 1,
        infos: 0,
        byRule: {
          'layer-violation': 1,
        },
      },
    })

    const trust = buildTrustReport(report)
    const reasonLabels = trust.top_reasons.map((reason) => reason.label)
    expect(reasonLabels).toContain('Architecture signals')
  })

  it('compares merge risk thresholds for CI gating', () => {
    expect(shouldFailByMaxRisk('CRITICAL', 'HIGH')).toBe(true)
    expect(shouldFailByMaxRisk('HIGH', 'HIGH')).toBe(false)
    expect(shouldFailByMaxRisk('LOW', 'MEDIUM')).toBe(false)
  })

  it('evaluates trust gate using combined thresholds', () => {
    const trust = buildTrustReport(createBaseReport({ totalScore: 30 }))
    const mediumTrust = { ...trust, trust_score: 65, merge_risk: 'HIGH' as const }

    expect(shouldFailTrustGate(mediumTrust, { minTrust: 70 })).toBe(true)
    expect(shouldFailTrustGate(mediumTrust, { minTrust: 60 })).toBe(false)
    expect(shouldFailTrustGate(mediumTrust, { maxRisk: 'MEDIUM' })).toBe(true)
    expect(shouldFailTrustGate(mediumTrust, { maxRisk: 'HIGH' })).toBe(false)
  })

  it('treats disabled trust gate policy as pass-through', () => {
    const trust = buildTrustReport(createBaseReport({ totalScore: 30 }))
    const mediumTrust = { ...trust, trust_score: 65, merge_risk: 'HIGH' as const }

    expect(shouldFailTrustGate(mediumTrust, { enabled: false, minTrust: 90, maxRisk: 'LOW' })).toBe(false)

    const evaluation = evaluateTrustGate(mediumTrust, { enabled: false, minTrust: 90, maxRisk: 'LOW' })
    expect(evaluation.shouldFail).toBe(false)
    expect(evaluation.checks.gateDisabled).toBe(true)
    expect(evaluation.reasons).toContain('trust gate disabled by policy')
  })

  it('normalizes merge risk level inputs', () => {
    expect(normalizeMergeRiskLevel('low')).toBe('LOW')
    expect(normalizeMergeRiskLevel('MEDIUM')).toBe('MEDIUM')
    expect(normalizeMergeRiskLevel('nope')).toBeUndefined()
  })

  it('formats markdown output for PR comments', () => {
    const report = createBaseReport({
      targetPath: '/tmp/repo',
      totalScore: 22,
      summary: {
        errors: 1,
        warnings: 1,
        infos: 0,
        byRule: {
          'high-complexity': 1,
          'layer-violation': 1,
        },
      },
    })

    const diff: DriftDiff = {
      baseRef: 'origin/main',
      projectPath: '/tmp/repo',
      scannedAt: new Date().toISOString(),
      files: [
        {
          path: '/tmp/repo/src/a.ts',
          scoreBefore: 10,
          scoreAfter: 16,
          scoreDelta: 6,
          newIssues: [],
          resolvedIssues: [],
        },
      ],
      totalScoreBefore: 18,
      totalScoreAfter: 24,
      totalDelta: 6,
      newIssuesCount: 2,
      resolvedIssuesCount: 1,
    }

    const trust = buildTrustReport(report, { diff })
    const markdown = formatTrustMarkdown(trust)

    expect(markdown).toContain('## drift trust')
    expect(markdown).toContain('Base ref: `origin/main`')
    expect(markdown).toContain('### Top reasons')
  })

  it('renders selected trust output format deterministically', () => {
    const report = createBaseReport()
    const trust = buildTrustReport(report)

    expect(renderTrustOutput(trust, { json: true })).toBe(formatTrustJson(trust))
    expect(renderTrustOutput(trust, { markdown: true })).toBe(formatTrustMarkdown(trust))
    expect(renderTrustOutput(trust, { json: true, markdown: true })).toBe(formatTrustJson(trust))
  })

  it('adds schema metadata in trust JSON output without breaking trust payload', () => {
    const report = createBaseReport({ targetPath: '/tmp/metadata' })
    const trust = buildTrustReport(report)

    const jsonObject = formatTrustJsonObject(trust)
    expect(jsonObject.$schema).toBe('schemas/drift-trust.v1.json')
    expect(typeof jsonObject.toolVersion).toBe('string')
    expect(jsonObject.toolVersion.length).toBeGreaterThan(0)
    expect(jsonObject.trust_score).toBe(trust.trust_score)
    expect(jsonObject.merge_risk).toBe(trust.merge_risk)
    expect(jsonObject.targetPath).toBe('/tmp/metadata')

    const parsed = JSON.parse(formatTrustJson(trust)) as Record<string, unknown>
    expect(parsed.$schema).toBe('schemas/drift-trust.v1.json')
    expect(typeof parsed.toolVersion).toBe('string')
  })

  it('keeps baseline trust contract unchanged when advanced mode is disabled', () => {
    const report = createBaseReport({
      totalScore: 28,
      summary: {
        errors: 1,
        warnings: 2,
        infos: 0,
        byRule: {
          'debug-leftover': 3,
          'high-complexity': 1,
        },
      },
    })

    const trust = buildTrustReport(report)
    expect(trust.advanced_context).toBeUndefined()
    expect(trust.fix_priorities[0]).not.toHaveProperty('confidence')
    expect(trust.fix_priorities[0]).not.toHaveProperty('explanation')
    expect(trust.fix_priorities[0]).not.toHaveProperty('systemic')
  })

  it('enriches trust report with advanced comparison and metadata from previous trust JSON', () => {
    const report = createBaseReport({
      totalScore: 22,
      summary: {
        errors: 1,
        warnings: 1,
        infos: 0,
        byRule: {
          'layer-violation': 1,
          'debug-leftover': 1,
        },
      },
    })

    const trust = buildTrustReport(report, {
      advanced: {
        enabled: true,
        previousTrust: {
          trust_score: 60,
          merge_risk: 'HIGH',
        },
      },
    })

    expect(trust.advanced_context?.comparison?.source).toBe('previous-trust-json')
    expect(typeof trust.advanced_context?.comparison?.trust_delta).toBe('number')
    expect(trust.advanced_context?.team_guidance.length).toBeGreaterThan(0)
    expect(trust.fix_priorities[0]).toHaveProperty('confidence')
    expect(trust.fix_priorities[0]).toHaveProperty('explanation')
    expect(trust.fix_priorities[0]).toHaveProperty('systemic')
  })

  it('uses snapshot history as historical fallback in advanced mode', () => {
    const report = createBaseReport({ totalScore: 20 })
    const trust = buildTrustReport(report, {
      advanced: {
        enabled: true,
        snapshots: [
          {
            timestamp: '2026-01-01T00:00:00.000Z',
            label: 'baseline',
            score: 25,
            grade: 'MODERATE',
            totalIssues: 6,
            files: 4,
            byRule: {
              'debug-leftover': 2,
            },
          },
        ],
      },
    })

    expect(trust.advanced_context?.comparison?.source).toBe('snapshot-history')
    expect(trust.advanced_context?.comparison?.snapshot_score_delta).toBe(-5)
  })

  it('prioritizes systemic rules first in advanced mode', () => {
    const report = createBaseReport({
      totalScore: 30,
      summary: {
        errors: 1,
        warnings: 2,
        infos: 0,
        byRule: {
          'debug-leftover': 6,
          'layer-violation': 2,
        },
      },
    })

    const baseline = buildTrustReport(report)
    const advanced = buildTrustReport(report, { advanced: { enabled: true } })

    expect(baseline.fix_priorities[0]?.rule).toBe('debug-leftover')
    expect(advanced.fix_priorities[0]?.rule).toBe('layer-violation')
    expect(advanced.fix_priorities[0]?.systemic).toBe(true)
  })
})

describe('drift trust branch policy', () => {
  const config: DriftConfig = {
    trustGate: {
      enabled: true,
      minTrust: 45,
      maxRisk: 'HIGH',
      policyPacks: {
        strict: { enabled: true, minTrust: 90, maxRisk: 'LOW' },
        balanced: { minTrust: 60, maxRisk: 'MEDIUM' },
        lenient: { minTrust: 30, maxRisk: 'CRITICAL' },
      },
      presets: [
        { branch: '*', minTrust: 40, maxRisk: 'CRITICAL' },
        { branch: 'main', minTrust: 70, maxRisk: 'MEDIUM' },
        { branch: 'release/*', minTrust: 80, maxRisk: 'LOW' },
        { branch: 'release/legacy', enabled: false },
      ],
    },
  }

  it('falls back to base policy when branch does not match', () => {
    const policy = resolveTrustGatePolicy(config, 'feature/new-api')
    expect(policy).toMatchObject({ enabled: true, minTrust: 40, maxRisk: 'CRITICAL' })
  })

  it('prefers exact branch preset over wildcard preset', () => {
    const policy = resolveTrustGatePolicy(config, 'main')
    expect(policy).toMatchObject({ enabled: true, minTrust: 70, maxRisk: 'MEDIUM' })
  })

  it('prefers more specific wildcard when multiple patterns match', () => {
    const policy = resolveTrustGatePolicy(config, 'release/v1.2.3')
    expect(policy).toMatchObject({ enabled: true, minTrust: 80, maxRisk: 'LOW' })
  })

  it('applies enabled override from matching branch preset', () => {
    const policy = resolveTrustGatePolicy(config, 'release/legacy')
    expect(policy).toMatchObject({ enabled: false, minTrust: 80, maxRisk: 'LOW' })
  })

  it('returns empty policy when trust gate config is missing', () => {
    expect(resolveTrustGatePolicy(undefined, 'main')).toEqual({})
  })

  it('resolves precedence in deterministic order base -> pack -> branch -> overrides', () => {
    const policy = resolveTrustGatePolicy(config, {
      branchName: 'main',
      policyPack: 'strict',
      overrides: { maxRisk: 'CRITICAL' },
    })

    expect(policy).toMatchObject({ enabled: true, minTrust: 70, maxRisk: 'CRITICAL' })
  })

  it('reports invalid policy pack and preserves legacy branch behavior', () => {
    const legacy = resolveTrustGatePolicy(config, 'main')
    const explained = explainTrustGatePolicy(config, {
      branchName: 'main',
      policyPack: 'unknown-pack',
    })

    expect(explained.invalidPolicyPack).toBe('unknown-pack')
    expect(explained.effectivePolicy).toMatchObject(legacy)
  })

  it('keeps compatibility between branch-only and options signatures', () => {
    const branchOnly = resolveTrustGatePolicy(config, 'release/v1.2.3')
    const optionsBased = resolveTrustGatePolicy(config, { branchName: 'release/v1.2.3' })

    expect(optionsBased).toEqual(branchOnly)
  })

  it('explains resolution steps in application order', () => {
    const explained = explainTrustGatePolicy(config, {
      branchName: 'main',
      policyPack: 'balanced',
      overrides: { minTrust: 75 },
    })

    expect(explained.steps.map((step) => step.source)).toEqual([
      'base',
      'policy-pack',
      'branch-preset',
      'branch-preset',
      'overrides',
    ])
    expect(explained.effectivePolicy).toMatchObject({ enabled: true, minTrust: 75, maxRisk: 'MEDIUM' })
  })

  it('formats policy explanation with layer summary for CLI debug mode', () => {
    const explained = explainTrustGatePolicy(config, {
      branchName: 'main',
      policyPack: 'strict',
      overrides: { maxRisk: 'CRITICAL' },
    })

    const formatted = formatTrustGatePolicyExplanation(explained)
    expect(formatted).toContain('Trust gate policy resolution:')
    expect(formatted).toContain('base (trustGate)')
    expect(formatted).toContain('policy-pack (strict)')
    expect(formatted).toContain('branch-preset (main)')
    expect(formatted).toContain('overrides (cli)')
    expect(formatted).toContain('effective: enabled=true minTrust=70 maxRisk=CRITICAL')
  })

  it('detects branch names from CI environment candidates', () => {
    expect(detectBranchName({ GITHUB_HEAD_REF: 'feature/payment', GITHUB_REF_NAME: 'main' })).toBe('feature/payment')
    expect(detectBranchName({ GITHUB_REF_NAME: 'main' })).toBe('main')
    expect(detectBranchName({})).toBeUndefined()
  })
})

describe('drift trust calibration (golden)', () => {
  const scenarios: Array<{
    name: string
    report: DriftReport
    expected: { trust: number; risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
  }> = [
    {
      name: 'LOW - clean repo baseline',
      report: createBaseReport(),
      expected: { trust: 100, risk: 'LOW' },
    },
    {
      name: 'MEDIUM - moderate pressure with one error',
      report: createBaseReport({
        totalScore: 20,
        summary: {
          errors: 1,
          warnings: 2,
          infos: 0,
          byRule: {
            'high-complexity': 1,
            'debug-leftover': 2,
          },
        },
        maintenanceRisk: {
          score: 30,
          level: 'medium',
          hotspots: [],
          signals: {
            highComplexityFiles: 1,
            filesWithoutNearbyTests: 0,
            frequentChangeFiles: 0,
          },
        },
      }),
      expected: { trust: 77, risk: 'MEDIUM' },
    },
    {
      name: 'HIGH - multiple risk vectors without collapse',
      report: createBaseReport({
        totalScore: 30,
        summary: {
          errors: 2,
          warnings: 3,
          infos: 0,
          byRule: {
            'high-complexity': 2,
            'layer-violation': 1,
          },
        },
        maintenanceRisk: {
          score: 45,
          level: 'medium',
          hotspots: [
            {
              file: '/tmp/repo/src/risk.ts',
              driftScore: 46,
              complexityIssues: 2,
              hasNearbyTests: false,
              changeFrequency: 5,
              risk: 50,
              reasons: ['complexity and no tests'],
            },
          ],
          signals: {
            highComplexityFiles: 1,
            filesWithoutNearbyTests: 1,
            frequentChangeFiles: 1,
          },
        },
      }),
      expected: { trust: 56, risk: 'HIGH' },
    },
    {
      name: 'CRITICAL - broad architecture and hotspot failure',
      report: createBaseReport({
        totalScore: 70,
        summary: {
          errors: 5,
          warnings: 8,
          infos: 2,
          byRule: {
            'high-complexity': 4,
            'layer-violation': 2,
            'circular-dependency': 1,
            'debug-leftover': 3,
          },
        },
        maintenanceRisk: {
          score: 80,
          level: 'critical',
          hotspots: [
            {
              file: '/tmp/repo/src/critical.ts',
              driftScore: 84,
              complexityIssues: 6,
              hasNearbyTests: false,
              changeFrequency: 11,
              risk: 90,
              reasons: ['architecture collapse'],
            },
          ],
          signals: {
            highComplexityFiles: 3,
            filesWithoutNearbyTests: 2,
            frequentChangeFiles: 3,
          },
        },
      }),
      expected: { trust: 3, risk: 'CRITICAL' },
    },
  ]

  it.each(scenarios)('$name', ({ report, expected }) => {
    const trust = buildTrustReport(report)
    expect(trust.trust_score).toBe(expected.trust)
    expect(trust.merge_risk).toBe(expected.risk)
  })

  it('applies deterministic diff penalty when PR regresses', () => {
    const report = createBaseReport({ totalScore: 20 })
    const diff: DriftDiff = {
      baseRef: 'origin/main',
      projectPath: '/tmp/repo',
      scannedAt: new Date().toISOString(),
      files: [],
      totalScoreBefore: 20,
      totalScoreAfter: 30,
      totalDelta: 10,
      newIssuesCount: 3,
      resolvedIssuesCount: 0,
    }

    const trust = buildTrustReport(report, { diff })
    expect(trust.diff_context).toMatchObject({
      baseRef: 'origin/main',
      status: 'regressed',
      penalty: 29,
      bonus: 0,
      netImpact: 29,
    })
  })

  it('applies deterministic diff bonus when PR improves', () => {
    const report = createBaseReport({ totalScore: 20 })
    const diff: DriftDiff = {
      baseRef: 'origin/main',
      projectPath: '/tmp/repo',
      scannedAt: new Date().toISOString(),
      files: [],
      totalScoreBefore: 35,
      totalScoreAfter: 20,
      totalDelta: -15,
      newIssuesCount: 0,
      resolvedIssuesCount: 4,
    }

    const trust = buildTrustReport(report, { diff })
    expect(trust.diff_context).toMatchObject({
      baseRef: 'origin/main',
      status: 'improved',
      penalty: 0,
      bonus: 20,
      netImpact: -20,
    })
    expect(trust.trust_score).toBe(100)
  })
})
