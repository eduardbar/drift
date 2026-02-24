import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { DriftReport } from './types.js'

function encodeMessage(msg: string): string {
  return msg
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C')
}

function severityToAnnotation(s: string): 'error' | 'warning' | 'notice' {
  if (s === 'error') return 'error'
  if (s === 'warning') return 'warning'
  return 'notice'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

export function emitCIAnnotations(report: DriftReport): void {
  for (const file of report.files) {
    for (const issue of file.issues) {
      const level = severityToAnnotation(issue.severity)
      const relPath = relative(process.cwd(), file.path).replace(/\\/g, '/')
      const msg = encodeMessage(`[drift/${issue.rule}] ${issue.message}`)
      const line = issue.line ?? 1
      const col = issue.column ?? 1
      process.stdout.write(`::${level} file=${relPath},line=${line},col=${col}::${msg}\n`)
    }
  }
}

export function printCISummary(report: DriftReport): void {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY']
  if (!summaryPath) return

  const score = report.totalScore
  const grade = scoreLabel(score)

  let errors = 0
  let warnings = 0
  let info = 0

  for (const file of report.files) {
    for (const issue of file.issues) {
      if (issue.severity === 'error') errors++
      else if (issue.severity === 'warning') warnings++
      else info++
    }
  }

  const sorted = [...report.files]
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, 10)

  const rows = sorted
    .map((f) => {
      const relPath = relative(process.cwd(), f.path).replace(/\\/g, '/')
      return `| ${relPath} | ${f.score} | ${f.issues.length} |`
    })
    .join('\n')

  const md = [
    '## drift scan results',
    '',
    `**Score:** ${score}/100 — Grade **${grade}**`,
    '',
    '### Top files by issue count',
    '',
    '| File | Score | Issues |',
    '|------|-------|--------|',
    rows,
    '',
    `**Total issues:** ${errors} errors, ${warnings} warnings, ${info} info`,
    '',
  ].join('\n')

  writeFileSync(summaryPath, md, { flag: 'a' })
}
