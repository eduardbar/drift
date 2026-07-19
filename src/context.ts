import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Project } from 'ts-morph'
import type {
  AIOutput,
  ContextArchitectureSummary,
  ContextDocument,
  ContextHealth,
  ContextViolation,
  DriftConfig,
  DriftReport,
} from './types.js'
import { scoreToGradeText } from './utils.js'
import { FIX_SUGGESTIONS } from './reporter-constants.js'
import { detectCycleEdges } from './map-cycles.js'
import { createDebouncedWatcher } from './watch-utils.js'

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }

export interface ContextGenerationOptions {
  output?: string
  format?: 'markdown' | 'json'
  maxIssues?: number
  ci?: boolean
  watch?: boolean
  driftVersion?: string
}

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

function collectImportAdjacency(projectPath: string): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 1 },
  })

  project.addSourceFilesAtPaths([
    `${projectPath}/**/*.ts`,
    `${projectPath}/**/*.tsx`,
    `${projectPath}/**/*.js`,
    `${projectPath}/**/*.jsx`,
    `!${projectPath}/**/node_modules/**`,
    `!${projectPath}/**/dist/**`,
    `!${projectPath}/**/.next/**`,
    `!${projectPath}/**/*.d.ts`,
  ])

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath()
    if (!adjacency.has(filePath)) adjacency.set(filePath, new Set())

    for (const decl of file.getImportDeclarations()) {
      const source = decl.getModuleSpecifierSourceFile()
      if (!source) continue
      adjacency.get(filePath)!.add(source.getFilePath())
    }
  }

  return adjacency
}

function countCircularDependencies(projectPath: string): number {
  try {
    const adjacency = collectImportAdjacency(projectPath)
    return detectCycleEdges(adjacency).size
  } catch {
    return 0
  }
}

function normalizeModules(config: DriftConfig | undefined): Array<{ name: string }> {
  return config?.modules ?? config?.moduleBoundaries ?? config?.boundaries ?? []
}

function buildArchitectureSummary(
  projectPath: string,
  config: DriftConfig | undefined,
): ContextArchitectureSummary {
  return {
    layers: config?.layers?.map((layer) => layer.name) ?? [],
    modules: normalizeModules(config).map((m) => m.name),
    circularDependencies: countCircularDependencies(projectPath),
  }
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

  for (const violation of topViolations.slice(0, 3)) {
    actions.push(`- [${violation.rule}] ${violation.file}:${violation.line} — ${violation.fixSuggestion}`)
  }

  return actions
}

export function buildContextDocument(
  projectPath: string,
  report: DriftReport,
  aiOutput: AIOutput,
  config?: DriftConfig,
  options?: { maxIssues?: number },
): ContextDocument {
  const maxIssues = options?.maxIssues ?? 20
  const topViolations = buildTopViolations(aiOutput, maxIssues)

  return {
    generatedAt: new Date().toISOString(),
    driftVersion: VERSION,
    projectPath,
    health: buildHealth(report, aiOutput),
    topViolations,
    architectureSummary: buildArchitectureSummary(projectPath, config),
    guidelines: buildGuidelines(aiOutput.context_for_ai.rules_detected),
    recommendedActions: buildRecommendedActions(aiOutput, topViolations),
  }
}

function formatViolation(violation: ContextViolation): string {
  const lines: string[] = []
  lines.push(`### ${violation.rank}. \`${violation.file}\` — Line ${violation.line}`)
  lines.push('')
  lines.push(`- **Line**: ${violation.line}`)
  lines.push(`- **Rule**: \`${violation.rule}\` (${violation.severity})`)
  lines.push(`- **Message**: ${violation.message}`)
  lines.push(`- **Fix suggestion**: ${violation.fixSuggestion}`)
  lines.push(`- **Effort**: ${violation.effort}`)
  lines.push('')
  lines.push('```typescript')
  lines.push(violation.snippet)
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

function formatArchitectureSummary(summary: ContextArchitectureSummary): string {
  const lines: string[] = []
  lines.push(`- **Layers**: ${summary.layers.length > 0 ? summary.layers.join(', ') : 'none configured'}`)
  lines.push(`- **Modules**: ${summary.modules.length > 0 ? summary.modules.join(', ') : 'none configured'}`)
  lines.push(`- **Circular dependencies**: ${summary.circularDependencies}`)
  return lines.join('\n')
}

export function formatContextMarkdown(doc: ContextDocument): string {
  const lines: string[] = []
  const grade = doc.health.grade

  lines.push('# Drift Context')
  lines.push('')
  lines.push(`<!-- drift-context-metadata: score=${doc.health.score} generatedAt=${doc.generatedAt} driftVersion=${doc.driftVersion} -->`)
  lines.push('')
  lines.push(`> Generated: ${new Date(doc.generatedAt).toLocaleString()}`)
  lines.push(`> Drift version: ${doc.driftVersion}`)
  lines.push(`> Project path: \`${doc.projectPath}\``)
  lines.push('')

  lines.push('## Project Health')
  lines.push('')
  lines.push(`- **Score**: ${doc.health.score}/100 (${grade})`)
  lines.push(`- **Total issues**: ${doc.health.totalIssues}`)
  lines.push(`- **Errors**: ${doc.health.errors}`)
  lines.push(`- **Warnings**: ${doc.health.warnings}`)
  lines.push(`- **Infos**: ${doc.health.infos}`)
  lines.push(`- **Files affected**: ${doc.health.filesAffected}`)
  lines.push(`- **Files clean**: ${doc.health.filesClean}`)
  lines.push('')

  lines.push('## Active Violations')
  lines.push('')
  if (doc.topViolations.length === 0) {
    lines.push('No active violations.')
  } else {
    for (const violation of doc.topViolations) {
      lines.push(formatViolation(violation))
    }
  }
  lines.push('')

  lines.push('## Architecture Summary')
  lines.push('')
  lines.push(formatArchitectureSummary(doc.architectureSummary))
  lines.push('')

  lines.push('## AI Coding Guidelines')
  lines.push('')
  for (const guideline of doc.guidelines) {
    lines.push(guideline)
  }
  lines.push('')

  lines.push('## Recommended Actions')
  lines.push('')
  for (const action of doc.recommendedActions) {
    lines.push(action)
  }
  lines.push('')

  return lines.join('\n')
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
    try {
      unlinkSync(tempPath)
    } catch {
      // Preserve the original write error if cleanup also fails.
    }
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

export interface WatchHandle {
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
    outputPath
      ? (eventPath) => {
          const resolvedEventPath = resolve(eventPath)
          return resolvedEventPath === resolve(outputPath) || resolvedEventPath === resolve(dirname(outputPath))
        }
      : undefined,
  )

  return watcher
}
