// drift-ignore-file
import kleur from 'kleur'
import type { DriftIssue, DriftReport, DriftDiff } from './types.js'
import { scoreToGrade, severityIcon, scoreBar } from './utils.js'

function formatFixSuggestion(issue: DriftIssue): string[] {
  const suggestions: Record<string, string[]> = {
    'debug-leftover': [
      'Remove this console.log statement',
      'Or replace with a proper logging library',
    ],
    'any-abuse': [
      "Replace 'any' with 'unknown' for type safety",
      'Or define a proper interface/type for this data',
    ],
    'dead-code': [
      'Remove this unused import',
    ],
    'catch-swallow': [
      'Add error handling: console.error(error) or logger.error(error)',
      'Or re-throw if this should bubble up: throw error',
    ],
    'large-function': [
      'Extract logic into smaller functions',
      'Each function should do one thing',
    ],
    'large-file': [
      'Split into multiple files by responsibility',
      'Consider using a directory with index.ts',
    ],
    'no-return-type': [
      'Add explicit return type: function foo(): ReturnType',
    ],
    'duplicate-function-name': [
      'Consolidate with existing function',
      'Or rename to clarify different behavior',
    ],
    'high-complexity': [
      'Extract each branch into a named function',
      'Use early returns to reduce nesting and branching',
      'Consider a strategy pattern or lookup table for switch-heavy logic',
    ],
    'deep-nesting': [
      'Invert conditions and return early instead of nesting',
      'Extract inner blocks into separate functions',
      'Flatten promise chains with async/await',
    ],
    'too-many-params': [
      'Group related params into an options object: foo({ a, b, c, d, e })',
      'Consider if this function is doing too many things',
    ],
    'high-coupling': [
      'Group related imports into a single module',
      'Consider if this file has too many responsibilities',
      'Extract a sub-module that encapsulates some of these dependencies',
    ],
    'promise-style-mix': [
      'Pick one style and use it consistently: async/await is preferred',
      'Convert .then()/.catch() chains to async/await',
    ],
    'magic-number': [
      'Extract to a named constant: const MAX_RETRIES = 3',
      'Use an enum for related numeric values',
    ],
    'comment-contradiction': [
      'Remove the comment — the code already says what it does',
      'Replace with a comment explaining WHY, not what: // retry because upstream is flaky',
    ],
    'unused-export': [
      "Remove the export keyword if it's only used internally",
      'Or delete the declaration entirely if it serves no purpose',
    ],
    'dead-file': [
      'Delete the file if it is no longer needed',
      'Or import it from an entry point if it should be active',
    ],
    'unused-dependency': [
      'Remove it from package.json: npm uninstall <pkg>',
      'Or verify it is used transitively and document why it is kept',
    ],
    'circular-dependency': [
      'Introduce an abstraction (interface or shared module) that both files depend on',
      'Move shared logic to a third file that neither of the cyclic modules imports',
      'Use dependency injection to break the compile-time dependency',
    ],
    'layer-violation': [
      'Move the import to a layer that is allowed to access this dependency',
      'Introduce a port/interface in the domain layer to invert the dependency (Dependency Inversion Principle)',
      'Or adjust the layer rules in drift.config.ts if this import is intentional',
    ],
    'cross-boundary-import': [
      "Import from the module's public API barrel (index.ts) instead of internal paths",
      'Or add the module to allowedExternalImports in drift.config.ts if this is intentional',
      'Consider using dependency injection or an event bus to decouple the modules',
    ],
  }
  return suggestions[issue.rule] ?? ['Review and fix manually']
}

export function printConsole(report: DriftReport, options?: { showFix?: boolean }): void {
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
      if (options?.showFix) {
        const fixes = formatFixSuggestion(issue)
        console.log(kleur.gray('       ┌──────────────────────────────────────────────────────┐'))
        if (issue.snippet) {
          const line = issue.snippet.split('\n')[0].slice(0, 48)
          console.log(kleur.gray('       │  ') + kleur.red('- ' + line))
        }
        for (const fix of fixes) {
          console.log(kleur.gray('       │  ') + kleur.green('+ ' + fix))
        }
        console.log(kleur.gray('       └──────────────────────────────────────────────────────┘'))
      } else if (issue.snippet) {
        const snippetIndent = '    ' + ' '.repeat(icon.length + 1)
        console.log(kleur.gray(`${snippetIndent}${issue.snippet.split('\n')[0].slice(0, 120)}`))
      }
    }
    console.log()
  }
}

export function printDiff(diff: DriftDiff): void {
  const { totalDelta, totalScoreBefore, totalScoreAfter, newIssuesCount, resolvedIssuesCount } = diff

  const deltaSign = totalDelta > 0 ? '+' : ''
  const deltaColor = totalDelta > 0 ? kleur.red : totalDelta < 0 ? kleur.green : kleur.white
  const baseGrade = scoreToGrade(totalScoreBefore)
  const headGrade = scoreToGrade(totalScoreAfter)

  console.log()
  console.log(kleur.bold('  drift diff') + kleur.gray(`  — comparing HEAD vs ${diff.baseRef}`))
  console.log('  ' + '─'.repeat(50))
  console.log()
  console.log(
    `  Score  ${kleur.bold(String(totalScoreBefore))} ${baseGrade.badge}  →  ` +
    `${kleur.bold(String(totalScoreAfter))} ${headGrade.badge}  ` +
    deltaColor(`(${deltaSign}${totalDelta})`)
  )
  console.log()

  if (newIssuesCount > 0) {
    console.log(`  ${kleur.red(`▲ ${newIssuesCount} new issue${newIssuesCount !== 1 ? 's' : ''} introduced`)}`)
  }
  if (resolvedIssuesCount > 0) {
    console.log(`  ${kleur.green(`▼ ${resolvedIssuesCount} issue${resolvedIssuesCount !== 1 ? 's' : ''} resolved`)}`)
  }
  if (newIssuesCount === 0 && resolvedIssuesCount === 0) {
    console.log(`  ${kleur.gray('No issue changes detected')}`)
  }

  if (diff.files.length === 0) {
    console.log()
    console.log(`  ${kleur.gray('No file-level changes detected')}`)
    console.log()
    return
  }

  console.log()
  console.log('  ' + '─'.repeat(50))
  console.log()

  for (const file of diff.files) {
    const rel = file.path.replace(/\\/g, '/').split('/').pop() ?? file.path
    const fileDeltaSign = file.scoreDelta > 0 ? '+' : ''
    const fileDeltaColor = file.scoreDelta > 0 ? kleur.red : kleur.green

    console.log(
      `  ${kleur.bold(rel)}` +
      `  ${kleur.gray(`${file.scoreBefore} → ${file.scoreAfter}`)}` +
      `  ${fileDeltaColor(`${fileDeltaSign}${file.scoreDelta}`)}`
    )

    for (const issue of file.newIssues) {
      console.log(
        `    ${kleur.red('+')} ${severityIcon(issue.severity)} ` +
        `${kleur.yellow(issue.rule)}  ${kleur.gray(`L${issue.line}`)}  ${issue.message}`
      )
    }
    for (const issue of file.resolvedIssues) {
      console.log(
        `    ${kleur.green('-')} ${severityIcon(issue.severity)} ` +
        `${kleur.yellow(issue.rule)}  ${kleur.gray(`L${issue.line}`)}  ${issue.message}`
      )
    }
    console.log()
  }
}
