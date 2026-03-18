import { describe, expect, it } from 'vitest'
import { diffToSarif, toSarif } from '../src/sarif.js'
import type { DriftDiff, DriftReport } from '../src/types.js'

describe('toSarif', () => {
  function createReport(): DriftReport {
    return {
      scannedAt: '2026-03-17T10:20:30.000Z',
      targetPath: '/repo',
      files: [{
        path: 'src/app.ts',
        score: 72,
        issues: [
          {
            rule: 'large-file',
            severity: 'error',
            message: 'File exceeds threshold',
            line: 14,
            column: 3,
            snippet: 'export function app() {}',
          },
          {
            rule: 'debug-leftover',
            severity: 'warning',
            message: 'console.log detected',
            line: 22,
            column: 1,
            snippet: 'console.log(value)',
          },
          {
            rule: 'plugin-warning',
            severity: 'info',
            message: 'Plugin diagnostic',
            line: 1,
            column: 1,
            snippet: 'app.ts',
          },
        ],
      }],
      totalIssues: 3,
      totalScore: 72,
      totalFiles: 1,
      summary: {
        errors: 1,
        warnings: 1,
        infos: 1,
        byRule: {
          'large-file': 1,
          'debug-leftover': 1,
          'plugin-warning': 1,
        },
      },
      quality: {
        overall: 90,
        dimensions: {
          architecture: 91,
          complexity: 87,
          'ai-patterns': 92,
          testing: 89,
        },
      },
      maintenanceRisk: {
        score: 20,
        level: 'low',
        hotspots: [],
        signals: {
          highComplexityFiles: 0,
          filesWithoutNearbyTests: 0,
          frequentChangeFiles: 0,
        },
      },
    }
  }

  it('maps drift severities to SARIF levels', () => {
    const sarif = toSarif(createReport())
    const levels = sarif.runs[0].results.map((result) => result.level)

    expect(levels).toContain('error')
    expect(levels).toContain('warning')
    expect(levels).toContain('note')
  })

  it('builds SARIF minimal valid structure', () => {
    const sarif = toSarif(createReport())

    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs).toHaveLength(1)
    expect(sarif.runs[0].tool.driver.name).toBe('drift')
    expect(Array.isArray(sarif.runs[0].results)).toBe(true)
    expect(sarif.runs[0].results).toHaveLength(3)
  })

  it('maps message and location fields for each issue', () => {
    const sarif = toSarif(createReport())
    const result = sarif.runs[0].results.find((item) => item.ruleId === 'large-file')

    expect(result).toBeDefined()
    expect(result?.message.text).toBe('File exceeds threshold')
    expect(result?.locations[0].physicalLocation.artifactLocation.uri).toBe('src/app.ts')
    expect(result?.locations[0].physicalLocation.region.startLine).toBe(14)
    expect(result?.locations[0].physicalLocation.region.startColumn).toBe(3)
    expect(result?.properties?.weight).toBe(20)
    expect(result?.properties?.fileScore).toBe(72)
  })

  it('maps diff newIssues to SARIF results', () => {
    const diff: DriftDiff = {
      baseRef: 'origin/main',
      projectPath: '/repo',
      scannedAt: '2026-03-17T10:20:30.000Z',
      files: [
        {
          path: 'src/app.ts',
          scoreBefore: 60,
          scoreAfter: 72,
          scoreDelta: 12,
          newIssues: [
            {
              rule: 'debug-leftover',
              severity: 'warning',
              message: 'console.log detected',
              line: 22,
              column: 1,
              snippet: 'console.log(value)',
            },
          ],
          resolvedIssues: [
            {
              rule: 'magic-number',
              severity: 'info',
              message: 'legacy issue resolved',
              line: 10,
              column: 5,
              snippet: '42',
            },
          ],
        },
      ],
      totalScoreBefore: 60,
      totalScoreAfter: 72,
      totalDelta: 12,
      newIssuesCount: 1,
      resolvedIssuesCount: 1,
    }

    const sarif = diffToSarif(diff)

    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].results).toHaveLength(1)
    expect(sarif.runs[0].results[0]?.ruleId).toBe('debug-leftover')
    expect(sarif.runs[0].results[0]?.locations[0]?.physicalLocation?.artifactLocation?.uri).toBe('src/app.ts')
    expect(sarif.runs[0].results[0]?.properties?.baseRef).toBe('origin/main')
    expect(sarif.runs[0].results[0]?.properties?.scoreDelta).toBe(12)
    expect(sarif.runs[0].results[0]?.properties?.changeType).toBe('new-issue')
    expect(sarif.runs[0].properties.baseRef).toBe('origin/main')
    expect(sarif.runs[0].properties.newIssuesCount).toBe(1)
    expect(sarif.runs[0].properties.resolvedIssuesCount).toBe(1)
  })
})
