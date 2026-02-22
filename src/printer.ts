import kleur from 'kleur'
import type { DriftReport } from './types.js'
import { scoreToGrade, severityIcon, scoreBar } from './utils.js'

export function printConsole(report: DriftReport): void {
  const sep = kleur.gray('  ' + '─'.repeat(50))

  console.log()
  console.log(kleur.bold().white('  drift') + kleur.gray('  —  vibe coding debt detector'))
  console.log(sep)
  console.log()

  const grade = scoreToGrade(report.totalScore)
  const scoreColor = report.totalScore === 0
    ? kleur.green
    : report.totalScore < 45
    ? kleur.yellow
    : kleur.red

  const bar = scoreBar(report.totalScore)
  console.log(
    `  Score   ${kleur.gray(bar)}  ${scoreColor().bold(String(report.totalScore))}/100  ${grade.badge}`
  )

  const cleanFiles = report.totalFiles - report.files.length
  console.log(
    kleur.gray(
      `  ${report.files.length} file(s) with issues  ·  ${report.summary.errors} errors  ·  ${report.summary.warnings} warnings  ·  ${report.summary.infos} info  ·  ${cleanFiles} files clean`
    )
  )
  console.log()

  // Top issues in header
  const topRules = Object.entries(report.summary.byRule).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topRules.length > 0) {
    const parts = topRules.map(([rule, count]) => `${kleur.cyan(rule)} ${kleur.gray(`×${count}`)}`)
    console.log(`  Top issues:  ${parts.join(kleur.gray('  ·  '))}`)
    console.log()
  }

  console.log(sep)
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
        const snippetIndent = '    ' + ' '.repeat(icon.length + 1)
        console.log(kleur.gray(`${snippetIndent}${issue.snippet.split('\n')[0].slice(0, 120)}`))
      }
    }
    console.log()
  }
}
