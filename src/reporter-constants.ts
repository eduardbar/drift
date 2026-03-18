import type { DriftIssue } from './types.js'

export const FIX_SUGGESTIONS: Record<string, string> = {
  'large-file': 'Consider splitting this file into smaller modules with single responsibility',
  'large-function': 'Extract logic into smaller functions with descriptive names',
  'debug-leftover': 'Remove this console.log or replace with proper logging library',
  'dead-code': 'Remove unused import to keep code clean',
  'duplicate-function-name': 'Consolidate with existing function or rename to clarify different behavior',
  'any-abuse': "Replace 'any' with proper type definition",
  'catch-swallow': 'Add error handling or logging in catch block',
  'no-return-type': 'Add explicit return type for better type safety',
}

export const RULE_EFFORT: Record<string, 'low' | 'medium' | 'high'> = {
  'debug-leftover': 'low',
  'dead-code': 'low',
  'no-return-type': 'low',
  'any-abuse': 'medium',
  'catch-swallow': 'medium',
  'large-file': 'high',
  'large-function': 'high',
  'duplicate-function-name': 'high',
}

export const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 }
export const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

export const AI_SIGNAL_RULES = new Set([
  'over-commented',
  'hardcoded-config',
  'inconsistent-error-handling',
  'unnecessary-abstraction',
  'naming-inconsistency',
  'comment-contradiction',
  'promise-style-mix',
  'any-abuse',
  'ai-code-smell',
])

export const AI_CODE_SMELL_BOOST = 20
export const AI_TRIGGER_LIMIT = 4
export const AI_LIKELIHOOD_THRESHOLD = 35
export const AI_SMELL_SCORE_MULTIPLIER = 15
export const AI_SUSPECTED_LIMIT = 10

export type DriftIssueWithFile = { file: string; issue: DriftIssue }
