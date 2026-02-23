import type { FileReport, DriftReport, DriftIssue } from './types.js'
import { scoreToGradeText, severityIcon } from './utils.js'

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
