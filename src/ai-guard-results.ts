import type { AIGuardIssue, AIGuardResult, GuardFileReports } from './types/ai-guard.js'
import { FIX_SUGGESTIONS } from './reporter-constants.js'

function relativeIssuePath(root: string, file: string | undefined): string | undefined {
  if (!file) return undefined
  const candidate = root && file.startsWith(root) ? file.slice(root.length) : file
  return candidate.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^\.\//, '')
}

function issueKey(issue: AIGuardIssue): string {
  return `${issue.file ?? ''}|${issue.rule}|${issue.message ?? ''}`
}

function sortIssues(issues: AIGuardIssue[]): AIGuardIssue[] {
  return [...issues].sort((left, right) => issueKey(left).localeCompare(issueKey(right)) || (left.line ?? 0) - (right.line ?? 0))
}

function flatten(reports: GuardFileReports, root: string): AIGuardIssue[] {
  return reports.flatMap(file => file.issues.map(issue => ({ ...issue, file: relativeIssuePath(root, file.path) })))
}

function projectScore(files: GuardFileReports): number {
  return files.length ? Math.round(files.reduce((sum, file) => sum + file.score, 0) / files.length) : 100
}

export function computeAIGuardResult(before: GuardFileReports, after: GuardFileReports, roots: { before?: string; after?: string } = {}): Pick<AIGuardResult, 'scoreBefore' | 'scoreAfter' | 'scoreDelta' | 'newIssues' | 'resolvedIssues' | 'issues'> {
  const beforeIssues = sortIssues(flatten(before, roots.before ?? ''))
  const afterIssues = sortIssues(flatten(after, roots.after ?? ''))
  const beforeKeys = new Set(beforeIssues.map(issueKey))
  const afterKeys = new Set(afterIssues.map(issueKey))
  const scoreBefore = projectScore(before)
  const scoreAfter = projectScore(after)
  return {
    scoreBefore,
    scoreAfter,
    scoreDelta: scoreAfter - scoreBefore,
    newIssues: afterIssues.filter(issue => !beforeKeys.has(issueKey(issue))),
    resolvedIssues: beforeIssues.filter(issue => !afterKeys.has(issueKey(issue))),
    issues: afterIssues,
  }
}

export function enforceBudget(scoreDelta: number, budget = 0): { passed: boolean; reason?: string } {
  return scoreDelta <= budget ? { passed: true, reason: undefined } : { passed: false, reason: `score delta ${scoreDelta} exceeds budget ${budget}` }
}

export function enforceBlockOn(issues: Array<Pick<AIGuardIssue, 'rule' | 'severity'>>, blockOn: string[] = []): { passed: boolean; reason?: string } {
  const blocked = issues.find(issue => blockOn.includes(issue.rule) || blockOn.includes(issue.severity))
  return blocked ? { passed: false, reason: `blocked by ${blocked.rule} (${blocked.severity})` } : { passed: true, reason: undefined }
}

interface AssembleAIGuardResultContext {
  delta: Pick<AIGuardResult, 'scoreBefore' | 'scoreAfter' | 'scoreDelta' | 'newIssues' | 'resolvedIssues' | 'issues'>
  source: AIGuardResult['source']
  files: string[]
  budget: { passed: boolean; reason?: string }
  block: { passed: boolean; reason?: string }
  includeSuggestions: boolean
}

export function assembleAIGuardResult(context: AssembleAIGuardResultContext): AIGuardResult {
  const { delta, source, files, budget, block, includeSuggestions } = context
  const result: AIGuardResult = {
    ...delta,
    passed: budget.passed && block.passed,
    source,
    files,
    reason: budget.reason ?? block.reason,
  }
  if (includeSuggestions) result.suggestions = result.newIssues.map(issue => ({ ...issue, suggestion: FIX_SUGGESTIONS[issue.rule] ?? 'Review and fix this issue' }))
  return result
}

export function formatAIGuardJson(result: AIGuardResult): string {
  return JSON.stringify(result, null, 2)
}

export function formatAIGuardHuman(result: AIGuardResult): string {
  const sign = result.scoreDelta >= 0 ? '+' : ''
  const lines = [
    `AI guard: ${result.passed ? 'PASS' : 'FAIL'}`,
    `Score: ${result.scoreBefore} -> ${result.scoreAfter} (${sign}${result.scoreDelta})`,
    `New issues: ${result.newIssues.length}`,
    `Resolved issues: ${result.resolvedIssues.length}`,
  ]
  if (result.reason) lines.push(`Reason: ${result.reason}`)
  for (const suggestion of result.suggestions ?? []) lines.push(`Suggestion [${suggestion.rule}] ${suggestion.file ?? ''}: ${suggestion.suggestion}`)
  return lines.join('\n')
}
