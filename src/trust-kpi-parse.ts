import { readFileSync } from 'node:fs'
import { MERGE_RISK_ORDER, normalizeMergeRiskLevel } from './trust.js'
import type { MergeRiskLevel, TrustDiffContext, TrustKpiDiagnostic } from './types.js'
import type { DiffStatus, ParsedTrustArtifact } from './trust-kpi-types.js'

const DIFF_STATUS_VALUES = new Set(['improved', 'regressed', 'neutral'])

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createDiffContextWarning(message: string): { diagnostic: TrustKpiDiagnostic } {
  return {
    diagnostic: {
      level: 'warning',
      code: 'invalid-diff-context',
      message,
    },
  }
}

function getFiniteNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolveDiffStatus(rawStatus: unknown, scoreDelta: number): DiffStatus {
  if (typeof rawStatus === 'string' && DIFF_STATUS_VALUES.has(rawStatus)) {
    return rawStatus as DiffStatus
  }
  if (scoreDelta < 0) return 'improved'
  if (scoreDelta > 0) return 'regressed'
  return 'neutral'
}

function parseDiffContextBase(raw: Record<string, unknown>): {
  baseRef: string
  scoreDelta: number | null
  newIssues: number | null
  resolvedIssues: number | null
  filesChanged: number
  penalty: number
  bonus: number
  netImpact: number
} {
  return {
    baseRef: typeof raw.baseRef === 'string' ? raw.baseRef : 'unknown',
    scoreDelta: getFiniteNumber(raw, 'scoreDelta'),
    newIssues: getFiniteNumber(raw, 'newIssues'),
    resolvedIssues: getFiniteNumber(raw, 'resolvedIssues'),
    filesChanged: getFiniteNumber(raw, 'filesChanged') ?? 0,
    penalty: getFiniteNumber(raw, 'penalty') ?? 0,
    bonus: getFiniteNumber(raw, 'bonus') ?? 0,
    netImpact: getFiniteNumber(raw, 'netImpact') ?? 0,
  }
}

function normalizeDiffContext(raw: unknown): { diffContext?: TrustDiffContext; diagnostic?: TrustKpiDiagnostic } {
  if (!isObjectLike(raw)) {
    return createDiffContextWarning('diff_context is present but malformed; skipping diff trend fields for this artifact')
  }

  const parsed = parseDiffContextBase(raw)

  if (parsed.scoreDelta == null || parsed.newIssues == null || parsed.resolvedIssues == null) {
    return createDiffContextWarning('diff_context is missing numeric scoreDelta/newIssues/resolvedIssues; skipping diff trend fields for this artifact')
  }

  const normalizedStatus = resolveDiffStatus(raw.status, parsed.scoreDelta)

  return {
    diffContext: {
      baseRef: parsed.baseRef,
      status: normalizedStatus,
      scoreDelta: parsed.scoreDelta,
      newIssues: parsed.newIssues,
      resolvedIssues: parsed.resolvedIssues,
      filesChanged: parsed.filesChanged,
      penalty: parsed.penalty,
      bonus: parsed.bonus,
      netImpact: parsed.netImpact,
    },
  }
}

function readJsonFile(filePath: string): { parsed?: unknown; diagnostics: TrustKpiDiagnostic[] } {
  let rawContent = ''
  try {
    rawContent = readFileSync(filePath, 'utf8')
  } catch (error) {
    return {
      diagnostics: [{
        level: 'error',
        code: 'read-failed',
        file: filePath,
        message: error instanceof Error ? error.message : String(error),
      }],
    }
  }

  try {
    return { parsed: JSON.parse(rawContent), diagnostics: [] }
  } catch (error) {
    return {
      diagnostics: [{
        level: 'error',
        code: 'parse-failed',
        file: filePath,
        message: error instanceof Error ? error.message : String(error),
      }],
    }
  }
}

function normalizeArtifactShape(parsed: unknown, filePath: string): { artifact?: Record<string, unknown>; diagnostics: TrustKpiDiagnostic[] } {
  if (isObjectLike(parsed)) {
    return { artifact: parsed, diagnostics: [] }
  }

  return {
    diagnostics: [{
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: 'Trust artifact must be a JSON object',
    }],
  }
}

function parseTrustScore(raw: Record<string, unknown>, filePath: string): { trustScore?: number; diagnostics: TrustKpiDiagnostic[] } {
  const trustScore = raw.trust_score
  if (typeof trustScore === 'number' && Number.isFinite(trustScore)) {
    return { trustScore, diagnostics: [] }
  }

  return {
    diagnostics: [{
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: 'Missing numeric trust_score',
    }],
  }
}

function parseMergeRisk(raw: Record<string, unknown>, filePath: string): { mergeRisk?: MergeRiskLevel; diagnostics: TrustKpiDiagnostic[] } {
  const mergeRisk = typeof raw.merge_risk === 'string'
    ? normalizeMergeRiskLevel(raw.merge_risk)
    : undefined

  if (mergeRisk) {
    return { mergeRisk, diagnostics: [] }
  }

  return {
    diagnostics: [{
      level: 'error',
      code: 'invalid-shape',
      file: filePath,
      message: `Missing/invalid merge_risk (expected one of ${MERGE_RISK_ORDER.join(', ')})`,
    }],
  }
}

export function parseTrustArtifact(filePath: string): { record?: ParsedTrustArtifact; diagnostics: TrustKpiDiagnostic[] } {
  const readResult = readJsonFile(filePath)
  if (readResult.diagnostics.length > 0) {
    return { diagnostics: readResult.diagnostics }
  }

  const shape = normalizeArtifactShape(readResult.parsed, filePath)
  if (!shape.artifact) {
    return { diagnostics: shape.diagnostics }
  }

  const trustScoreResult = parseTrustScore(shape.artifact, filePath)
  if (trustScoreResult.trustScore === undefined) {
    return { diagnostics: trustScoreResult.diagnostics }
  }

  const mergeRiskResult = parseMergeRisk(shape.artifact, filePath)
  if (!mergeRiskResult.mergeRisk) {
    return { diagnostics: mergeRiskResult.diagnostics }
  }

  const diagnostics: TrustKpiDiagnostic[] = []
  let diffContext: TrustDiffContext | undefined

  if (shape.artifact.diff_context !== undefined) {
    const normalized = normalizeDiffContext(shape.artifact.diff_context)
    if (normalized.diagnostic) {
      diagnostics.push({ ...normalized.diagnostic, file: filePath })
    } else {
      diffContext = normalized.diffContext
    }
  }

  return {
    record: {
      filePath,
      trustScore: trustScoreResult.trustScore,
      mergeRisk: mergeRiskResult.mergeRisk,
      diffContext,
    },
    diagnostics,
  }
}
