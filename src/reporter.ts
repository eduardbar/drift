import type { FileReport, DriftReport, DriftIssue } from './types.js'

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
    summary: {
      errors: allIssues.filter((i) => i.severity === 'error').length,
      warnings: allIssues.filter((i) => i.severity === 'warning').length,
      infos: allIssues.filter((i) => i.severity === 'info').length,
      byRule,
    },
  }
}

export function formatMarkdown(report: DriftReport): string {
  const grade = scoreToGrade(report.totalScore)
  const lines: string[] = []

  lines.push(`# drift report`)
  lines.push(``)
  lines.push(`> Generated: ${new Date(report.scannedAt).toLocaleString()}`)
  lines.push(`> Path: \`${report.targetPath}\``)
  lines.push(``)
  lines.push(`## Overall drift score: ${report.totalScore}/100 ${grade.badge}`)
  lines.push(``)
  lines.push(`| | Count |`)
  lines.push(`|---|---|`)
  lines.push(`| Errors | ${report.summary.errors} |`)
  lines.push(`| Warnings | ${report.summary.warnings} |`)
  lines.push(`| Info | ${report.summary.infos} |`)
  lines.push(`| Files with issues | ${report.files.length} |`)
  lines.push(`| Total issues | ${report.totalIssues} |`)
  lines.push(``)

  if (Object.keys(report.summary.byRule).length > 0) {
    lines.push(`## Issues by rule`)
    lines.push(``)
    const sorted = Object.entries(report.summary.byRule).sort((a, b) => b[1] - a[1])
    for (const [rule, count] of sorted) {
      lines.push(`- \`${rule}\`: ${count}`)
    }
    lines.push(``)
  }

  if (report.files.length === 0) {
    lines.push(`## No drift detected`)
    lines.push(``)
    lines.push(`No issues found. Clean codebase.`)
  } else {
    lines.push(`## Files (sorted by drift score)`)
    lines.push(``)
    for (const file of report.files) {
      lines.push(`### \`${file.path}\` — score ${file.score}/100`)
      lines.push(``)
      for (const issue of file.issues) {
        const icon = severityIcon(issue.severity)
        lines.push(`**${icon} [${issue.rule}]** Line ${issue.line}: ${issue.message}`)
        lines.push(`\`\`\``)
        lines.push(issue.snippet)
        lines.push(`\`\`\``)
        lines.push(``)
      }
    }
  }

  return lines.join('\n')
}

function scoreToGrade(score: number): { badge: string; label: string } {
  if (score === 0) return { badge: '✦ CLEAN', label: 'clean' }
  if (score < 20) return { badge: '◎ LOW', label: 'low' }
  if (score < 45) return { badge: '◈ MODERATE', label: 'moderate' }
  if (score < 70) return { badge: '◉ HIGH', label: 'high' }
  return { badge: '⬡ CRITICAL', label: 'critical' }
}

function severityIcon(s: DriftIssue['severity']): string {
  if (s === 'error') return '✖'
  if (s === 'warning') return '▲'
  return '◦'
}
