import type {
  GuardianConfig,
  GuardianExitConfig,
  GuardianFinding,
  GuardianResult,
  GuardianSeverity,
  GuardianVerdict,
} from './types.js'

/**
 * Pure domain helpers for Drift Guardian. No I/O, no git — everything here is
 * deterministic and unit-testable without a repository.
 */

export const GUARDIAN_SEVERITY_ORDER: GuardianSeverity[] = ['blocking', 'error', 'warning', 'info']

const DEFAULT_EXIT: Required<GuardianExitConfig> = {
  failOn: ['blocking', 'error'],
  warnOnViolation: true,
}

export function defaultGuardianConfig(): GuardianConfig {
  return {
    version: 1,
    architecture: { rules: [] },
    dependencies: { forbidden: [] },
    protectedPaths: [],
    api: { detectPublicChanges: true, breakingOnly: true },
    ai: {
      enabled: false,
      provider: undefined,
      model: undefined,
      review: { architecture: true, missingTests: true, behavior: true, prSummary: false },
      maxFindings: 20,
      timeoutSeconds: 60,
    },
    exit: { ...DEFAULT_EXIT },
  }
}

export function countFindings(findings: GuardianFinding[]): GuardianResult['summary'] {
  const summary: GuardianResult['summary'] = { blocking: 0, errors: 0, warnings: 0, infos: 0 }
  for (const finding of findings) {
    switch (finding.severity) {
      case 'blocking':
        summary.blocking += 1
        break
      case 'error':
        summary.errors += 1
        break
      case 'warning':
        summary.warnings += 1
        break
      case 'info':
        summary.infos += 1
        break
    }
  }
  return summary
}

/**
 * Verdict derivation (TRD §3): fail when any finding matches `exit.failOn`,
 * warn when a warning exists and `warnOnViolation` is true, otherwise pass.
 */
export function deriveVerdict(findings: GuardianFinding[], exit?: GuardianExitConfig): GuardianVerdict {
  const failOn = exit?.failOn ?? DEFAULT_EXIT.failOn
  for (const finding of findings) {
    if (failOn.includes(finding.severity)) return 'fail'
  }
  const warnOnViolation = exit?.warnOnViolation ?? DEFAULT_EXIT.warnOnViolation
  if (warnOnViolation && findings.some(finding => finding.severity === 'warning')) return 'warn'
  return 'pass'
}

function hashString(value: string): string {
  // FNV-1a — deterministic, dependency-free, good enough for stable ids.
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Deterministic finding id: `<ruleId>-<hash(ruleId|file|line)>`.
 * Same inputs always produce the same id (BACKEND_SCHEMA §2.4).
 */
export function findingId(ruleId: string, file?: string, line?: number): string {
  const source = `${ruleId}|${file ?? ''}|${line ?? 0}`
  return `${ruleId}-${hashString(source)}`
}
