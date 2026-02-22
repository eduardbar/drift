import kleur from 'kleur'
import type { DriftReport } from './types.js'
import { scoreToGrade, severityIcon } from './utils.js'

export function printConsole(report: DriftReport): void {
  console.log()
  console.log(kleur.bold().white('  drift') + kleur.gray(' — vibe coding debt detector'))
  console.log()

  const grade = scoreToGrade(report.totalScore)
  const scoreColor = report.totalScore === 0
    ? kleur.green
    : report.totalScore < 45
    ? kleur.yellow
    : kleur.red

  console.log(
    `  Score  ${scoreColor().bold(String(report.totalScore).padStart(3))}${kleur.gray('/100')}  ${grade.badge}`
  )
  console.log(
    kleur.gray(
      `  ${report.files.length} file(s) with issues  ·  ${report.summary.errors} errors  ·  ${report.summary.warnings} warnings  ·  ${report.summary.infos} info`
    )
  )
  console.log()

  if (report.files.length === 0) {
    console.log(kleur.green('  No drift detected. Clean codebase.'))
    console.log()
    return
  }

  for (const file of report.files) {
    const rel = file.path.replace(report.targetPath, '').replace(/^[\\/]/, '')
    console.log(
      kleur.bold().white(`  ${rel}`) +
        kleur.gray(` (score ${file.score}/100)`)
    )

    for (const issue of file.issues) {
      const icon = severityIcon(issue.severity)
      const colorFn = (s: string) =>
        issue.severity === 'error'
          ? kleur.red(s)
          : issue.severity === 'warning'
          ? kleur.yellow(s)
          : kleur.cyan(s)

      console.log(
        `    ${colorFn(icon)} ` +
          kleur.gray(`L${issue.line}`) +
          `  ` +
          colorFn(issue.rule) +
          `  ` +
          kleur.white(issue.message)
      )
      if (issue.snippet) {
        console.log(kleur.gray(`       ${issue.snippet.split('\n')[0].slice(0, 100)}`))
      }
    }
    console.log()
  }

  // Top drifting rules summary
  const sorted = Object.entries(report.summary.byRule).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (sorted.length > 0) {
    console.log(kleur.gray('  Top rules:'))
    for (const [rule, count] of sorted) {
      console.log(kleur.gray(`    · ${rule}: ${count}`))
    }
    console.log()
  }
}
