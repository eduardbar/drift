import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type {
  AIOutput,
  ContextDocument,
  ContextHealth,
  ContextViolation,
  DriftConfig,
  DriftReport,
} from './types.js'
import { scoreToGradeText } from './utils.js'
import { FIX_SUGGESTIONS } from './reporter-constants.js'
import { createDebouncedWatcher, isOutputArtifactPath } from './watch-utils.js'
import { formatContextMarkdown } from './context-markdown.js'
import { buildArchitectureSummary } from './context-architecture.js'

export { formatContextMarkdown }

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }
const DEFAULT_MAX_ISSUES = 20
const MAX_RECOMMENDED_ACTIONS = 3

function buildHealth(report: DriftReport, aiOutput: AIOutput): ContextHealth {
  const grade = scoreToGradeText(report.totalScore)
  return {
    score: report.totalScore,
    grade: grade.label.toUpperCase(),
    totalIssues: report.totalIssues,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    infos: report.summary.infos,
    filesAffected: aiOutput.summary.files_affected,
    filesClean: aiOutput.summary.files_clean,
  }
}

function buildTopViolations(aiOutput: AIOutput, maxIssues: number): ContextViolation[] {
  return aiOutput.priority_order.slice(0, maxIssues).map((issue) => ({
    rank: issue.rank,
    file: issue.file,
    line: issue.line,
    rule: issue.rule,
    severity: issue.severity as 'error' | 'warning' | 'info',
    message: issue.message,
    snippet: issue.snippet,
    fixSuggestion: issue.fix_suggestion,
    effort: issue.effort,
  }))
}

function buildGuidelines(rulesDetected: string[]): string[] {
  if (rulesDetected.length === 0) {
    return ['No active violations — codebase is clean.']
  }

  return rulesDetected.map((rule) => {
    const suggestion = FIX_SUGGESTIONS[rule] ?? 'Review and fix this issue.'
    return `- Avoid **\`${rule}\`**: ${suggestion}`
  })
}

function buildRecommendedActions(aiOutput: AIOutput, topViolations: ContextViolation[]): string[] {
  const actions: string[] = []
  actions.push(aiOutput.context_for_ai.recommended_action)

  for (const violation of topViolations.slice(0, MAX_RECOMMENDED_ACTIONS)) {
    actions.push(`- [${violation.rule}] ${violation.file}:${violation.line} — ${violation.fixSuggestion}`)
  }

  return actions
}

export function buildContextDocument(
  projectPath: string,
  report: DriftReport,
  aiOutput: AIOutput,
  options?: { config?: DriftConfig; maxIssues?: number },
): ContextDocument {
  const maxIssues = options?.maxIssues ?? DEFAULT_MAX_ISSUES
  const topViolations = buildTopViolations(aiOutput, maxIssues)

  return {
    generatedAt: new Date().toISOString(),
    driftVersion: VERSION,
    projectPath,
    health: buildHealth(report, aiOutput),
    topViolations,
    architectureSummary: buildArchitectureSummary(projectPath, options?.config),
    guidelines: buildGuidelines(aiOutput.context_for_ai.rules_detected),
    recommendedActions: buildRecommendedActions(aiOutput, topViolations),
  }
}

export function writeContextFile(
  filePath: string,
  doc: ContextDocument,
  fileSystem: { renameSync?: typeof renameSync } = {},
): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const markdown = formatContextMarkdown(doc)
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  const move = fileSystem.renameSync ?? renameSync

  try {
    writeFileSync(tempPath, markdown, 'utf8')
    move(tempPath, filePath)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

export function checkContextFreshness(
  filePath: string,
  currentScore: number,
  threshold = 0,
): { fresh: boolean; missing: boolean; recordedScore?: number; delta?: number } {
  if (!existsSync(filePath)) {
    return { fresh: false, missing: true }
  }

  const content = readFileSync(filePath, 'utf8')
  const match = content.match(/<!-- drift-context-metadata: score=(\d+)/)
  if (!match) {
    return { fresh: false, missing: false }
  }

  const recordedScore = Number(match[1])
  const delta = Math.abs(currentScore - recordedScore)
  return {
    fresh: delta <= threshold,
    missing: false,
    recordedScore,
    delta,
  }
}

interface WatchHandle {
  close: () => void
}

export function runWatch(
  projectPath: string,
  generate: () => Promise<void>,
  delayMs = 300,
  outputPath?: string,
): WatchHandle {
  let running = false

  const watcher = createDebouncedWatcher(
    projectPath,
    () => {
      if (running) return
      running = true
      generate().finally(() => {
        running = false
      })
    },
    delayMs,
    outputPath ? (eventPath) => isOutputArtifactPath(eventPath, outputPath) : undefined,
  )

  return watcher
}
