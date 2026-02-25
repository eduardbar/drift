import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { DriftReport } from './types.js'

const GRADE_THRESHOLDS = {
  A: 80,
  B: 60,
  C: 40,
  D: 20,
}

const TOP_FILES_LIMIT = 10

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
  if (score >= GRADE_THRESHOLDS.A) return 'A'
  if (score >= GRADE_THRESHOLDS.B) return 'B'
  if (score >= GRADE_THRESHOLDS.C) return 'C'
  if (score >= GRADE_THRESHOLDS.D) return 'D'
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

function countIssuesBySeverity(report: DriftReport): { errors: number; warnings: number; info: number } {
  let errors = 0
  let warnings = 0
  let info = 0

  for (const file of report.files) {
    countFileIssues(file, { errors: () => errors++, warnings: () => warnings++, info: () => info++ })
  }

  return { errors, warnings, info }
}

function countFileIssues(
  file: { issues: Array<{ severity: string }> },
  counters: { errors: () => void; warnings: () => void; info: () => void },
): void {
  for (const issue of file.issues) {
    if (issue.severity === 'error') counters.errors()
    else if (issue.severity === 'warning') counters.warnings()
    else counters.info()
  }
}

export function printCISummary(report: DriftReport): void {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY']
  if (!summaryPath) return

  const score = report.totalScore
  const grade = scoreLabel(score)
  const { errors, warnings, info } = countIssuesBySeverity(report)

  const sorted = [...report.files]
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, TOP_FILES_LIMIT)

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
