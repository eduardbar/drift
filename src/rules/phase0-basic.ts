import { SourceFile, SyntaxKind } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment, getSnippet, getFunctionLikeLines, collectFunctionLikes, getFileLines } from './shared.js'

const LARGE_FILE_THRESHOLD = 300
const LARGE_FUNCTION_THRESHOLD = 50
const SNIPPET_TRUNCATE_SHORT = 60
const SNIPPET_TRUNCATE_LONG = 120

export function detectLargeFile(file: SourceFile): DriftIssue[] {
  const lineCount = file.getEndLineNumber()
  if (lineCount > LARGE_FILE_THRESHOLD) {
    return [
      {
        rule: 'large-file',
        severity: 'error',
        message: `File has ${lineCount} lines (threshold: ${LARGE_FILE_THRESHOLD}). Large files are the #1 sign of AI-generated structural drift.`,
        line: 1,
        column: 1,
        snippet: `// ${lineCount} lines total`,
      },
    ]
  }
  return []
}

export function detectLargeFunctions(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns = collectFunctionLikes(file)

  for (const fn of fns) {
    const lines = getFunctionLikeLines(fn)
    const startLine = fn.getStartLineNumber()
    if (lines > LARGE_FUNCTION_THRESHOLD) {
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'large-function',
        severity: 'error',
        message: `Function spans ${lines} lines (threshold: ${LARGE_FUNCTION_THRESHOLD}). AI tends to dump logic into single functions.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

export function detectDebugLeftovers(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression().getText()
    const line = call.getStartLineNumber()
    if (/^console\.(log|warn|error|debug|info)\b/.test(expr)) {
      if (hasIgnoreComment(file, line)) continue
      issues.push({
        rule: 'debug-leftover',
        severity: 'warning',
        message: `console.${expr.split('.')[1]} left in production code.`,
        line,
        column: call.getStartLinePos(),
        snippet: getSnippet(call, file),
      })
    }
  }

  const lines = getFileLines(file)
  lines.forEach((lineContent, i) => {
    if (/\/\/\s*(TODO|FIXME|HACK|XXX|TEMP)\b/i.test(lineContent)) {
      if (hasIgnoreComment(file, i + 1)) return
      issues.push({
        rule: 'debug-leftover',
        severity: 'warning',
        message: `Unresolved marker found: ${lineContent.trim().slice(0, SNIPPET_TRUNCATE_SHORT)}`,
        line: i + 1,
        column: 1,
        snippet: lineContent.trim().slice(0, SNIPPET_TRUNCATE_LONG),
      })
    }
  })

  return issues
}

export function detectDeadCode(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const identifierCounts = new Map<string, number>()

  for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = id.getText()
    identifierCounts.set(text, (identifierCounts.get(text) ?? 0) + 1)
  }

  for (const imp of file.getImportDeclarations()) {
    for (const named of imp.getNamedImports()) {
      const name = named.getName()
      const refsCount = Math.max(0, (identifierCounts.get(name) ?? 0) - 1)
      if (refsCount === 0) {
        issues.push({
          rule: 'dead-code',
          severity: 'warning',
          message: `Unused import '${name}'. AI often imports more than it uses.`,
          line: imp.getStartLineNumber(),
          column: imp.getStartLinePos(),
          snippet: getSnippet(imp, file),
        })
      }
    }
  }

  return issues
}

export function detectDuplicateFunctionNames(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const seen = new Map<string, number>()

  const fns = file.getFunctions()
  for (const fn of fns) {
    const name = fn.getName()
    if (!name) continue
    const normalized = name.toLowerCase().replace(/[_-]/g, '')
    if (seen.has(normalized)) {
      issues.push({
        rule: 'duplicate-function-name',
        severity: 'error',
        message: `Function '${name}' looks like a duplicate of a previously defined function. AI often generates near-identical helpers.`,
        line: fn.getStartLineNumber(),
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    } else {
      seen.set(normalized, fn.getStartLineNumber())
    }
  }
  return issues
}

export function detectAnyAbuse(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  for (const node of file.getDescendantsOfKind(SyntaxKind.AnyKeyword)) {
    issues.push({
      rule: 'any-abuse',
      severity: 'warning',
      message: `Explicit 'any' type detected. AI defaults to 'any' when it can't infer types properly.`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      snippet: getSnippet(node, file),
    })
  }
  return issues
}

export function detectCatchSwallow(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  for (const tryCatch of file.getDescendantsOfKind(SyntaxKind.TryStatement)) {
    const catchClause = tryCatch.getCatchClause()
    if (!catchClause) continue
    const block = catchClause.getBlock()
    const stmts = block.getStatements()
    if (stmts.length === 0) {
      const line = catchClause.getStartLineNumber()
      if (hasIgnoreComment(file, line)) continue
      issues.push({
        rule: 'catch-swallow',
        severity: 'warning',
        message: `Empty catch block silently swallows errors. Classic AI pattern to make code "not throw".`,
        line,
        column: catchClause.getStartLinePos(),
        snippet: getSnippet(catchClause, file),
      })
    }
  }
  return issues
}

export function detectMissingReturnTypes(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  for (const fn of file.getFunctions()) {
    if (!fn.getReturnTypeNode()) {
      issues.push({
        rule: 'no-return-type',
        severity: 'info',
        message: `Function '${fn.getName() ?? 'anonymous'}' has no explicit return type.`,
        line: fn.getStartLineNumber(),
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}
