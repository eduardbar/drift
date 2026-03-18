import { createRequire } from 'node:module'
import type { DriftIssue, DriftReport } from './types.js'
import type { DriftDiff } from './types.js'
import { RULE_WEIGHTS } from './analyzer.js'

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }

export type SarifLevel = 'error' | 'warning' | 'note'

export interface DriftSarifRule {
  id: string
  name?: string
  shortDescription?: {
    text: string
  }
  defaultConfiguration?: {
    level: SarifLevel
  }
  properties?: {
    weight?: number
  }
}

export interface DriftSarifResult {
  ruleId: string
  level: SarifLevel
  message: {
    text: string
  }
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string
      }
      region: {
        startLine: number
        startColumn: number
      }
    }
  }>
  properties?: {
    weight?: number
    fileScore?: number
    driftSeverity: DriftIssue['severity']
    baseRef?: string
    scoreBefore?: number
    scoreAfter?: number
    scoreDelta?: number
    changeType?: 'new-issue'
  }
}

export interface DriftSarifRun {
  tool: {
    driver: {
      name: string
      version: string
      informationUri: string
      rules: DriftSarifRule[]
    }
  }
  results: DriftSarifResult[]
  properties: {
    scannedAt: string
    targetPath: string
    totalIssues: number
    totalScore: number
    totalFiles: number
    baseRef?: string
    totalDelta?: number
    newIssuesCount?: number
    resolvedIssuesCount?: number
  }
}

export interface DriftSarifLog {
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json'
  version: '2.1.0'
  runs: DriftSarifRun[]
}

interface SarifRunMetrics {
  scannedAt: string
  targetPath: string
  totalIssues: number
  totalScore: number
  totalFiles: number
  baseRef?: string
  totalDelta?: number
  newIssuesCount?: number
  resolvedIssuesCount?: number
}

function mapSeverityToSarifLevel(severity: DriftIssue['severity']): SarifLevel {
  switch (severity) {
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'note'
  }
}

function normalizeArtifactUri(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

function toSarifResult(
  filePath: string,
  fileScore: number,
  issue: DriftIssue,
  extraProperties?: Omit<NonNullable<DriftSarifResult['properties']>, 'weight' | 'fileScore' | 'driftSeverity'>,
): DriftSarifResult {
  const line = Math.max(issue.line, 1)
  const column = Math.max(issue.column, 1)
  const weight = RULE_WEIGHTS[issue.rule]?.weight

  return {
    ruleId: issue.rule,
    level: mapSeverityToSarifLevel(issue.severity),
    message: {
      text: issue.message,
    },
    locations: [{
      physicalLocation: {
        artifactLocation: {
          uri: normalizeArtifactUri(filePath),
        },
        region: {
          startLine: line,
          startColumn: column,
        },
      },
    }],
    properties: {
      weight,
      fileScore,
      driftSeverity: issue.severity,
      ...extraProperties,
    },
  }
}

function buildRules(results: DriftSarifResult[]): DriftSarifRule[] {
  const byRule = new Map<string, DriftSarifRule>()

  for (const result of results) {
    if (byRule.has(result.ruleId)) continue

    byRule.set(result.ruleId, {
      id: result.ruleId,
      name: result.ruleId,
      shortDescription: {
        text: `drift rule: ${result.ruleId}`,
      },
      defaultConfiguration: {
        level: result.level,
      },
      properties: {
        weight: result.properties?.weight,
      },
    })
  }

  return [...byRule.values()]
}

function buildSarifLog(results: DriftSarifResult[], metrics: SarifRunMetrics): DriftSarifLog {
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'drift',
          version: VERSION,
          informationUri: 'https://github.com/eduardbar/drift',
          rules: buildRules(results),
        },
      },
      results,
      properties: metrics,
    }],
  }
}

export function toSarif(report: DriftReport): DriftSarifLog {
  const results = report.files.flatMap((file) => file.issues.map((issue) => toSarifResult(file.path, file.score, issue)))

  return buildSarifLog(results, {
    scannedAt: report.scannedAt,
    targetPath: report.targetPath,
    totalIssues: report.totalIssues,
    totalScore: report.totalScore,
    totalFiles: report.totalFiles,
  })
}

export function diffToSarif(diff: DriftDiff): DriftSarifLog {
  const results = diff.files.flatMap((file) =>
    file.newIssues.map((issue) =>
      toSarifResult(file.path, file.scoreAfter, issue, {
        baseRef: diff.baseRef,
        scoreBefore: file.scoreBefore,
        scoreAfter: file.scoreAfter,
        scoreDelta: file.scoreDelta,
        changeType: 'new-issue',
      }),
    ),
  )

  return buildSarifLog(results, {
    scannedAt: diff.scannedAt,
    targetPath: diff.projectPath,
    totalIssues: diff.newIssuesCount,
    totalScore: diff.totalScoreAfter,
    totalFiles: diff.files.length,
    baseRef: diff.baseRef,
    totalDelta: diff.totalDelta,
    newIssuesCount: diff.newIssuesCount,
    resolvedIssuesCount: diff.resolvedIssuesCount,
  })
}
