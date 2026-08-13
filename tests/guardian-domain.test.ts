import { describe, expect, it } from 'vitest'
import {
  GUARDIAN_SEVERITY_ORDER,
  countFindings,
  defaultGuardianConfig,
  deriveVerdict,
  findingId,
} from '../src/guardian/index.js'
import type { GuardianFinding } from '../src/guardian/index.js'

function finding(severity: GuardianFinding['severity'], ruleId = severity): GuardianFinding {
  return { id: ruleId, ruleId, category: 'custom', severity, message: ruleId, locations: [] }
}

describe('Guardian domain public API', () => {
  it('exposes the documented defaults and severity order', () => {
    const config = defaultGuardianConfig()
    expect(GUARDIAN_SEVERITY_ORDER).toEqual(['blocking', 'error', 'warning', 'info'])
    expect(config).toMatchObject({
      version: 1,
      architecture: { rules: [] },
      dependencies: { forbidden: [] },
      protectedPaths: [],
      api: { detectPublicChanges: true, breakingOnly: true },
      ai: { enabled: false, maxFindings: 20, timeoutSeconds: 60 },
      exit: { failOn: ['blocking', 'error'], warnOnViolation: true },
    })
    expect(config.ai?.review).toEqual({ architecture: true, missingTests: true, behavior: true, prSummary: false })
  })

  it('counts every severity and derives fail, warn, and pass verdicts', () => {
    expect(countFindings(['blocking', 'error', 'warning', 'info'].map(severity => finding(severity as GuardianFinding['severity']))))
      .toEqual({ blocking: 1, errors: 1, warnings: 1, infos: 1 })
    expect(deriveVerdict([finding('error')])).toBe('fail')
    expect(deriveVerdict([finding('warning')])).toBe('warn')
    expect(deriveVerdict([finding('warning')], { warnOnViolation: false })).toBe('pass')
    expect(deriveVerdict([finding('info')])).toBe('pass')
  })

  it('creates stable FNV-1a finding IDs and changes them when inputs change', () => {
    const stable = findingId('architecture', 'src/a.ts', 7)
    expect(stable).toBe(findingId('architecture', 'src/a.ts', 7))
    expect(stable).toMatch(/^architecture-[0-9a-f]{8}$/)
    expect(findingId('architecture', 'src/b.ts', 7)).not.toBe(stable)
    expect(findingId('architecture', 'src/a.ts', 8)).not.toBe(stable)
  })
})
