import { describe, expect, it } from 'vitest'
import { computeDiff } from '../src/diff.js'
import type { DriftIssue, DriftReport } from '../src/types.js'

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

function withIssues(report: DriftReport, issues: DriftIssue[]): DriftReport {
  return {
    ...report,
    files: report.files.map((file, index) => {
      if (index !== 0) return file
      return {
        ...file,
        issues,
      }
    }),
    totalIssues: issues.length,
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

  it('does not create churn for LF vs CRLF snippets and column noise', () => {
    const base = createReport('C:/repo')
    const current = withIssues(createReport('C:/repo'), [
      {
        ...base.files[0].issues[0],
        column: 12,
        snippet: 'const answer = 42\r\n',
      },
    ])

    const diff = computeDiff(base, current, 'origin/main')

    expect(diff.files).toHaveLength(0)
    expect(diff.newIssuesCount).toBe(0)
    expect(diff.resolvedIssuesCount).toBe(0)
    expect(diff.totalDelta).toBe(0)
  })

  it('still detects genuinely new issues', () => {
    const base = createReport('C:/repo')
    const current = withIssues(createReport('C:/repo'), [
      ...base.files[0].issues,
      {
        rule: 'any-abuse',
        severity: 'warning',
        message: 'Avoid using any type. Use a specific type or unknown and narrow it safely.',
        line: 6,
        column: 9,
        snippet: 'const value: any = source',
      },
    ])

    const diff = computeDiff(base, current, 'origin/main')

    expect(diff.files).toHaveLength(1)
    expect(diff.newIssuesCount).toBe(1)
    expect(diff.resolvedIssuesCount).toBe(0)
    expect(diff.files[0]?.newIssues[0]?.rule).toBe('any-abuse')
  })
})
