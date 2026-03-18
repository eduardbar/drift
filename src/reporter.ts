import type {
  FileReport,
  DriftReport,
  DriftIssue,
  AIOutput,
  AIIssue,
  AIOutputJson,
  DriftReportJson,
} from './types.js'
import { scoreToGradeText, severityIcon } from './utils.js'
import { computeRepoQuality, computeMaintenanceRisk } from './metrics.js'
import { OUTPUT_SCHEMA, withOutputMetadata } from './output-metadata.js'

const FIX_SUGGESTIONS: Record<string, string> = {
  'large-file': 'Consider splitting this file into smaller modules with single responsibility',
  'large-function': 'Extract logic into smaller functions with descriptive names',
  'debug-leftover': 'Remove this console.log or replace with proper logging library',
  'dead-code': 'Remove unused import to keep code clean',
  'duplicate-function-name': 'Consolidate with existing function or rename to clarify different behavior',
  'any-abuse': "Replace 'any' with proper type definition",
  'catch-swallow': 'Add error handling or logging in catch block',
  'no-return-type': 'Add explicit return type for better type safety',
}

const RULE_EFFORT: Record<string, 'low' | 'medium' | 'high'> = {
  'debug-leftover': 'low',
  'dead-code': 'low',
  'no-return-type': 'low',
  'any-abuse': 'medium',
  'catch-swallow': 'medium',
  'large-file': 'high',
  'large-function': 'high',
  'duplicate-function-name': 'high',
}

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 }
const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }
const AI_SIGNAL_RULES = new Set([
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

const AI_CODE_SMELL_BOOST = 20
const AI_TRIGGER_LIMIT = 4
const AI_LIKELIHOOD_THRESHOLD = 35
const AI_SMELL_SCORE_MULTIPLIER = 15
const AI_SUSPECTED_LIMIT = 10

function summarizeIssues(allIssues: DriftIssue[]): DriftReport['summary'] {
  const byRule: Record<string, number> = {}

  for (const issue of allIssues) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1
  }

  return {
    errors: allIssues.filter((issue) => issue.severity === 'error').length,
    warnings: allIssues.filter((issue) => issue.severity === 'warning').length,
    infos: allIssues.filter((issue) => issue.severity === 'info').length,
    byRule,
  }
}

function calculateTotalScore(files: FileReport[]): number {
  if (files.length === 0) return 0
  return Math.round(files.reduce((sum, file) => sum + file.score, 0) / files.length)
}

function baseReportDefaults(summary: DriftReport['summary'], targetPath: string, files: FileReport[]): DriftReportJson {
  const filesWithIssues = files.filter((file) => file.issues.length > 0).sort((a, b) => b.score - a.score)

  const report: DriftReport = {
    scannedAt: new Date().toISOString(),
    targetPath,
    files: filesWithIssues,
    totalIssues: files.flatMap((file) => file.issues).length,
    totalScore: calculateTotalScore(files),
    totalFiles: files.length,
    summary,
    quality: {
      overall: 100,
      dimensions: {
        architecture: 100,
        complexity: 100,
        'ai-patterns': 100,
        testing: 100,
      },
    },
    maintenanceRisk: {
      score: 0,
      level: 'low',
      hotspots: [],
      signals: {
        highComplexityFiles: 0,
        filesWithoutNearbyTests: 0,
        frequentChangeFiles: 0,
      },
    },
  }

  return withOutputMetadata(report, OUTPUT_SCHEMA.report)
}

export function buildReport(targetPath: string, files: FileReport[]): DriftReportJson {
  const allIssues = files.flatMap((f) => f.issues)
  const summary = summarizeIssues(allIssues)
  const baseReport = baseReportDefaults(summary, targetPath, files)

  baseReport.quality = computeRepoQuality(targetPath, files)
  baseReport.maintenanceRisk = computeMaintenanceRisk(baseReport)

  return baseReport
}

function formatHeader(report: DriftReport, grade: { badge: string }): string[] {
  return [
    `# drift report`,
    ``,
    `> Generated: ${new Date(report.scannedAt).toLocaleString()}`,
    `> Path: \`${report.targetPath}\``,
    ``,
    `## Overall drift score: ${report.totalScore}/100 ${grade.badge}`,
    ``,
    `| | Count |`,
    `|---|---|`,
    `| Errors | ${report.summary.errors} |`,
    `| Warnings | ${report.summary.warnings} |`,
    `| Info | ${report.summary.infos} |`,
    `| Files with issues | ${report.files.length} |`,
    `| Total issues | ${report.totalIssues} |`,
    ``,
  ]
}

function formatByRule(byRule: Record<string, number>): string[] {
  if (Object.keys(byRule).length === 0) return []
  const sorted = Object.entries(byRule).sort((a, b) => b[1] - a[1])
  return [
    `## Issues by rule`,
    ``,
    ...sorted.map(([rule, count]) => `- \`${rule}\`: ${count}`),
    ``,
  ]
}

function formatFileSection(file: { path: string; score: number; issues: DriftIssue[] }): string[] {
  const lines: string[] = [
    `### \`${file.path}\` — score ${file.score}/100`,
    ``,
  ]
  for (const issue of file.issues) {
    lines.push(`**${severityIcon(issue.severity)} [${issue.rule}]** Line ${issue.line}: ${issue.message}`)
    lines.push(`\`\`\`typescript`)
    lines.push(issue.snippet)
    lines.push(`\`\`\``)
    lines.push(``)
  }
  return lines
}

export function formatMarkdown(report: DriftReport): string {
  const grade = scoreToGradeText(report.totalScore)
  const lines: string[] = []

  lines.push(...formatHeader(report, grade))
  lines.push(...formatByRule(report.summary.byRule))

  if (report.files.length === 0) {
    lines.push(`## No drift detected`, ``, `No issues found. Clean codebase.`)
  } else {
    lines.push(`## Files (sorted by drift score)`, ``)
    for (const file of report.files) {
      lines.push(...formatFileSection(file))
    }
  }

  return lines.join('\n')
}

function collectAllIssues(report: DriftReport): Array<{ file: string; issue: DriftIssue }> {
  const all: Array<{ file: string; issue: DriftIssue }> = []
  for (const file of report.files) {
    for (const issue of file.issues) {
      all.push({ file: file.path, issue })
    }
  }
  return all
}

function sortIssues(issues: Array<{ file: string; issue: DriftIssue }>): Array<{ file: string; issue: DriftIssue }> {
  return issues.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity]
    if (sevDiff !== 0) return sevDiff
    const effortA = RULE_EFFORT[a.issue.rule] ?? 'medium'
    const effortB = RULE_EFFORT[b.issue.rule] ?? 'medium'
    return EFFORT_ORDER[effortA] - EFFORT_ORDER[effortB]
  })
}

function buildAIIssue(item: { file: string; issue: DriftIssue }, rank: number): AIIssue {
  return {
    rank,
    file: item.file,
    line: item.issue.line,
    rule: item.issue.rule,
    severity: item.issue.severity,
    message: item.issue.message,
    snippet: item.issue.snippet,
    fix_suggestion: FIX_SUGGESTIONS[item.issue.rule] ?? 'Review and fix this issue',
    effort: RULE_EFFORT[item.issue.rule] ?? 'medium',
  }
}

function buildRecommendedAction(priorityOrder: AIIssue[]): string {
  if (priorityOrder.length === 0) return 'No issues detected. Codebase looks clean.'
  const lowEffortCount = priorityOrder.filter((i) => i.effort === 'low').length
  if (lowEffortCount > 0) {
    return `Focus on fixing ${lowEffortCount} low-effort issue(s) first - they're quick wins.`
  }
  return 'Start with the highest priority issue and work through them in order.'
}

function fileAILikelihood(fileIssues: DriftIssue[]): { score: number; triggers: string[] } {
  if (fileIssues.length === 0) return { score: 0, triggers: [] }
  const triggerCounts = new Map<string, number>()
  for (const issue of fileIssues) {
    if (!AI_SIGNAL_RULES.has(issue.rule)) continue
    triggerCounts.set(issue.rule, (triggerCounts.get(issue.rule) ?? 0) + 1)
  }
  const triggerTotal = [...triggerCounts.values()].reduce((sum, count) => sum + count, 0)
  const smellBoost = fileIssues.some((issue) => issue.rule === 'ai-code-smell') ? AI_CODE_SMELL_BOOST : 0
  const ratioScore = Math.round((triggerTotal / Math.max(fileIssues.length, 1)) * 100)
  const score = Math.max(0, Math.min(100, ratioScore + smellBoost))
  const triggers = [...triggerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, AI_TRIGGER_LIMIT)
    .map(([rule]) => rule)
  return { score, triggers }
}

function computeAILikelihood(report: DriftReport): {
  overall: number
  files: Array<{ path: string; ai_likelihood: number; triggers: string[] }>
  smellScore: number
} {
  const suspected = report.files
    .map((file) => {
      const likelihood = fileAILikelihood(file.issues)
      return {
        path: file.path,
        ai_likelihood: likelihood.score,
        triggers: likelihood.triggers,
      }
    })
    .filter((entry) => entry.ai_likelihood >= AI_LIKELIHOOD_THRESHOLD)
    .sort((a, b) => b.ai_likelihood - a.ai_likelihood)

  const overall = suspected.length === 0
    ? 0
    : Math.round(suspected.reduce((sum, entry) => sum + entry.ai_likelihood, 0) / suspected.length)

  const smellCount = report.files.flatMap((file) => file.issues).filter((issue) => issue.rule === 'ai-code-smell').length
  const smellScore = Math.min(100, smellCount * AI_SMELL_SCORE_MULTIPLIER)

  return {
    overall,
    files: suspected.slice(0, AI_SUSPECTED_LIMIT),
    smellScore,
  }
}

export function formatAIOutput(report: DriftReport): AIOutputJson {
  const allIssues = collectAllIssues(report)
  const sortedIssues = sortIssues(allIssues)
  const priorityOrder = sortedIssues.map((item, i) => buildAIIssue(item, i + 1))
  const rulesDetected = [...new Set(allIssues.map((i) => i.issue.rule))]
  const grade = scoreToGradeText(report.totalScore)
  const aiLikelihood = computeAILikelihood(report)

  const output: AIOutput = {
    summary: {
      score: report.totalScore,
      grade: grade.label.toUpperCase(),
      total_issues: report.totalIssues,
      files_affected: report.files.length,
      files_clean: report.totalFiles - report.files.length,
      ai_likelihood: aiLikelihood.overall,
      ai_code_smell_score: aiLikelihood.smellScore,
    },
    files_suspected: aiLikelihood.files,
    priority_order: priorityOrder,
    maintenance_risk: report.maintenanceRisk,
    quality: report.quality,
    context_for_ai: {
      project_type: 'typescript',
      scan_path: report.targetPath,
      rules_detected: rulesDetected,
      recommended_action: buildRecommendedAction(priorityOrder),
    },
  }

  return withOutputMetadata(output, OUTPUT_SCHEMA.ai)
}
