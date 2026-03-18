import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GuardBaseline, IssueSeverity } from './guard-types.js'

export interface NormalizedBaseline {
  score?: number
  totalIssues?: number
  bySeverity: Partial<Record<IssueSeverity, number>>
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined
}

function firstDefinedNumber(values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

function normalizeSeverity(baseline: GuardBaseline, severity: IssueSeverity): number | undefined {
  const summaryBySeverity = baseline.summary?.[`${severity}s` as 'errors' | 'warnings' | 'infos']

  return firstDefinedNumber([
    baseline.bySeverity?.[severity],
    severity === 'error' ? baseline.errors : undefined,
    severity === 'warning' ? baseline.warnings : undefined,
    severity === 'info' ? baseline.infos : undefined,
    summaryBySeverity,
  ])
}

function hasAnchor(baseline: NormalizedBaseline): boolean {
  if (baseline.score !== undefined || baseline.totalIssues !== undefined) {
    return true
  }

  const severities: IssueSeverity[] = ['error', 'warning', 'info']
  return severities.some((severity) => baseline.bySeverity[severity] !== undefined)
}

export function normalizeBaseline(baseline: GuardBaseline): NormalizedBaseline {
  const normalized: NormalizedBaseline = {
    score: parseNumber(baseline.score),
    totalIssues: parseNumber(baseline.totalIssues),
    bySeverity: {
      error: normalizeSeverity(baseline, 'error'),
      warning: normalizeSeverity(baseline, 'warning'),
      info: normalizeSeverity(baseline, 'info'),
    },
  }

  if (!hasAnchor(normalized)) {
    throw new Error('Invalid guard baseline: expected score, totalIssues, or severity counters (error/warning/info).')
  }

  return normalized
}

export function readBaselineFromFile(projectPath: string, baselinePath?: string): { baseline: NormalizedBaseline; path: string } | undefined {
  const resolvedBaselinePath = resolve(projectPath, baselinePath ?? 'drift-baseline.json')
  if (!existsSync(resolvedBaselinePath)) return undefined

  const raw = JSON.parse(readFileSync(resolvedBaselinePath, 'utf8')) as GuardBaseline
  return {
    baseline: normalizeBaseline(raw),
    path: resolvedBaselinePath,
  }
}
