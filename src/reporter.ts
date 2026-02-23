import type { FileReport, DriftReport, DriftIssue, AIOutput, AIIssue } from './types.js'
import { scoreToGradeText, severityIcon } from './utils.js'

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

export function buildReport(targetPath: string, files: FileReport[]): DriftReport {
  const allIssues = files.flatMap((f) => f.issues)
  const byRule: Record<string, number> = {}

  for (const issue of allIssues) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1
  }

  const totalScore =
    files.length > 0
      ? Math.round(files.reduce((sum, f) => sum + f.score, 0) / files.length)
      : 0

  return {
    scannedAt: new Date().toISOString(),
    targetPath,
    files: files.filter((f) => f.issues.length > 0).sort((a, b) => b.score - a.score),
    totalIssues: allIssues.length,
    totalScore,
    totalFiles: files.length,
    summary: {
      errors: allIssues.filter((i) => i.severity === 'error').length,
      warnings: allIssues.filter((i) => i.severity === 'warning').length,
      infos: allIssues.filter((i) => i.severity === 'info').length,
      byRule,
    },
  }
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

export function formatAIOutput(report: DriftReport): AIOutput {
  const allIssues: Array<{ file: string; issue: DriftIssue }> = []
  for (const file of report.files) {
    for (const issue of file.issues) {
      allIssues.push({ file: file.path, issue })
    }
  }

  const sortedIssues = allIssues.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity]
    if (sevDiff !== 0) return sevDiff
    const effortA = RULE_EFFORT[a.issue.rule] ?? 'medium'
    const effortB = RULE_EFFORT[b.issue.rule] ?? 'medium'
    return EFFORT_ORDER[effortA] - EFFORT_ORDER[effortB]
  })

  const priorityOrder: AIIssue[] = sortedIssues.map((item, index) => ({
    rank: index + 1,
    file: item.file,
    line: item.issue.line,
    rule: item.issue.rule,
    severity: item.issue.severity,
    message: item.issue.message,
    snippet: item.issue.snippet,
    fix_suggestion: FIX_SUGGESTIONS[item.issue.rule] ?? 'Review and fix this issue',
    effort: RULE_EFFORT[item.issue.rule] ?? 'medium',
  }))

  const rulesDetected = [...new Set(allIssues.map((i) => i.issue.rule))]
  const grade = scoreToGradeText(report.totalScore)

  let recommendedAction = 'No issues detected. Codebase looks clean.'
  if (priorityOrder.length > 0) {
    const lowEffortCount = priorityOrder.filter((i) => i.effort === 'low').length
    if (lowEffortCount > 0) {
      recommendedAction = `Focus on fixing ${lowEffortCount} low-effort issue(s) first - they're quick wins that improve code quality significantly.`
    } else {
      recommendedAction = 'Start with the highest priority issue listed and work through them in order.'
    }
  }

  return {
    summary: {
      score: report.totalScore,
      grade: grade.label.toUpperCase(),
      total_issues: report.totalIssues,
      files_affected: report.files.length,
      files_clean: report.totalFiles - report.files.length,
    },
    priority_order: priorityOrder,
    context_for_ai: {
      project_type: 'typescript',
      scan_path: report.targetPath,
      rules_detected: rulesDetected,
      recommended_action: recommendedAction,
    },
  }
}
