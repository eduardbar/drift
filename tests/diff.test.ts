import { describe, expect, it } from 'vitest'
import { computeDiff } from '../src/diff.js'
import type { DriftReport } from '../src/types.js'

function createReport(pathPrefix: string): DriftReport {
  return {
    scannedAt: new Date().toISOString(),
    targetPath: pathPrefix,
    files: [
      {
        path: `${pathPrefix}/src/a.ts`,
        score: 10,
        issues: [
          {
            rule: 'magic-number',
            severity: 'info',
            message: 'Magic number 42 used directly in logic. Extract to a named constant.',
            line: 4,
            column: 10,
            snippet: 'const answer = 42',
          },
        ],
      },
    ],
    totalIssues: 1,
    totalScore: 10,
    totalFiles: 1,
    summary: {
      errors: 0,
      warnings: 0,
      infos: 1,
      byRule: {
        'magic-number': 1,
      },
    },
    quality: {
      overall: 90,
      dimensions: {
        architecture: 100,
        complexity: 90,
        'ai-patterns': 90,
        testing: 100,
      },
    },
    maintenanceRisk: {
      score: 10,
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

describe('computeDiff', () => {
  it('treats slash and backslash file paths as the same file', () => {
    const base = createReport('C:/repo')
    const current = createReport('C:\\repo')

    const diff = computeDiff(base, current, 'origin/main')

    expect(diff.files).toHaveLength(0)
    expect(diff.newIssuesCount).toBe(0)
    expect(diff.resolvedIssuesCount).toBe(0)
    expect(diff.totalDelta).toBe(0)
  })
})
