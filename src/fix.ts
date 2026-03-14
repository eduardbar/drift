import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeProject, analyzeFile } from './analyzer.js'
import type { DriftIssue, DriftConfig, FileReport } from './types.js'
import { Project } from 'ts-morph'

export interface FixResult {
  file: string
  rule: string
  line: number
  description: string
  applied: boolean
  before?: string
  after?: string
}

const FIXABLE_RULES = new Set(['debug-leftover', 'catch-swallow'])

function isConsoleDebug(issue: DriftIssue): boolean {
  // debug-leftover for console.* has messages like "console.log left in production code."
  // Unresolved markers start with "Unresolved marker"
  return issue.rule === 'debug-leftover' && !issue.message.startsWith('Unresolved marker')
}

function isFixable(issue: DriftIssue): boolean {
  if (issue.rule === 'debug-leftover') return isConsoleDebug(issue)
  return FIXABLE_RULES.has(issue.rule)
}

function fixDebugLeftover(lines: string[], line: number): string[] {
  // line is 1-based, lines is 0-based
  return [...lines.slice(0, line - 1), ...lines.slice(line)]
}

function fixCatchSwallow(lines: string[], line: number): string[] {
  // line is 1-based — points to the catch (...) line
  let openBraceLine = line - 1 // convert to 0-based index

  // Find the opening { of the catch block (same line or next few lines)
  for (let i = openBraceLine; i < Math.min(openBraceLine + 3, lines.length); i++) { // drift-ignore
    if (lines[i].includes('{')) {
      openBraceLine = i
      break
    }
  }

  const indentMatch = lines[openBraceLine].match(/^(\s*)/)
  const indent = indentMatch ? indentMatch[1] + '  ' : '  '

  return [
    ...lines.slice(0, openBraceLine + 1),
    `${indent}// TODO: handle error`, // drift-ignore
    ...lines.slice(openBraceLine + 1),
  ]
}

function applyFixToLines(
  lines: string[],
  issue: DriftIssue
): { newLines: string[]; description: string } | null {
  if (issue.rule === 'debug-leftover' && isConsoleDebug(issue)) {
    return {
      newLines: fixDebugLeftover(lines, issue.line),
      description: `remove ${issue.message.split(' ')[0]} statement`,
    }
  }

  if (issue.rule === 'catch-swallow') {
    return {
      newLines: fixCatchSwallow(lines, issue.line),
      description: 'add TODO comment to empty catch block',
    }
  }

  return null
}

function collectFixableIssues(
  fileReports: FileReport[],
  options?: { rule?: string }
): Map<string, DriftIssue[]> {
  const fixableByFile = new Map<string, DriftIssue[]>()

  for (const report of fileReports) {
    const fixableIssues = report.issues.filter(issue => {
      if (!isFixable(issue)) return false
      if (options?.rule && issue.rule !== options.rule) return false
      return true
    })

    if (fixableIssues.length > 0) {
      fixableByFile.set(report.path, fixableIssues)
    }
  }

  return fixableByFile
}

function processFile(
  filePath: string,
  issues: DriftIssue[],
  dryRun: boolean
): FixResult[] {
  const content = readFileSync(filePath, 'utf8')
  let lines = content.split('\n')
  const results: FixResult[] = []

  const sortedIssues = [...issues].sort((a, b) => b.line - a.line)

  for (const issue of sortedIssues) {
    const before = lines[issue.line - 1]?.trim() ?? ''
    const fixResult = applyFixToLines(lines, issue)

    if (fixResult) {
      const after = fixResult.newLines[issue.line - 1]?.trim() ?? ''
      results.push({
        file: filePath,
        rule: issue.rule,
        line: issue.line,
        description: fixResult.description,
        applied: true,
        before,
        after,
      })
      lines = fixResult.newLines
    } else {
      results.push({
        file: filePath,
        rule: issue.rule,
        line: issue.line,
        description: 'no fix available',
        applied: false,
      })
    }
  }

  if (!dryRun) {
    writeFileSync(filePath, lines.join('\n'), 'utf8')
  }

  return results
}

export async function applyFixes(
  targetPath: string,
  config?: DriftConfig,
  options?: { rule?: string; dryRun?: boolean; write?: boolean; preview?: boolean }
): Promise<FixResult[]> {
  const resolvedPath = resolve(targetPath)
  const dryRun = options?.write
    ? false
    : options?.preview || options?.dryRun
      ? true
      : false

  let fileReports
  const stat = statSync(resolvedPath)

  if (stat.isFile()) {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 1 },
    })
    const sourceFile = project.addSourceFileAtPath(resolvedPath)
    fileReports = [analyzeFile(sourceFile)]
  } else {
    fileReports = analyzeProject(resolvedPath, config)
  }

  const fixableByFile = collectFixableIssues(fileReports, options)
  const results: FixResult[] = []

  for (const [filePath, issues] of fixableByFile) {
    results.push(...processFile(filePath, issues, dryRun))
  }

  return results
}
