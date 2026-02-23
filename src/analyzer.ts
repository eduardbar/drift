import {
  Project,
  SourceFile,
  SyntaxKind,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  MethodDeclaration,
} from 'ts-morph'
import type { DriftIssue, FileReport } from './types.js'

// Rules and their drift score weight
const RULE_WEIGHTS: Record<string, { severity: DriftIssue['severity']; weight: number }> = {
  'large-file':               { severity: 'error',   weight: 20 },
  'large-function':           { severity: 'error',   weight: 15 },
  'debug-leftover':           { severity: 'warning', weight: 10 },
  'dead-code':                { severity: 'warning', weight: 8  },
  'duplicate-function-name':  { severity: 'error',   weight: 18 },
  'comment-contradiction':    { severity: 'warning', weight: 12 },
  'no-return-type':           { severity: 'info',    weight: 5  },
  'catch-swallow':            { severity: 'warning', weight: 10 },
  'magic-number':             { severity: 'info',    weight: 3  },
  'any-abuse':                { severity: 'warning', weight: 8  },
}

type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration

function hasIgnoreComment(file: SourceFile, line: number): boolean {
  const lines = file.getFullText().split('\n')
  const currentLine = lines[line - 1] ?? ''
  const prevLine = lines[line - 2] ?? ''

  if (/\/\/\s*drift-ignore\b/.test(currentLine)) return true
  if (/\/\/\s*drift-ignore\b/.test(prevLine)) return true
  return false
}

function isFileIgnored(file: SourceFile): boolean {
  const firstLines = file.getFullText().split('\n').slice(0, 10).join('\n')
  return /\/\/\s*drift-ignore-file\b/.test(firstLines)
}

function getSnippet(node: Node, file: SourceFile): string {
  const startLine = node.getStartLineNumber()
  const lines = file.getFullText().split('\n')
  return lines
    .slice(Math.max(0, startLine - 1), startLine + 1)
    .join('\n')
    .trim()
    .slice(0, 120)
}

function getFunctionLikeLines(node: FunctionLike): number {
  return node.getEndLineNumber() - node.getStartLineNumber()
}

function detectLargeFile(file: SourceFile): DriftIssue[] {
  const lineCount = file.getEndLineNumber()
  if (lineCount > 300) {
    return [
      {
        rule: 'large-file',
        severity: 'error',
        message: `File has ${lineCount} lines (threshold: 300). Large files are the #1 sign of AI-generated structural drift.`,
        line: 1,
        column: 1,
        snippet: `// ${lineCount} lines total`,
      },
    ]
  }
  return []
}

function detectLargeFunctions(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  for (const fn of fns) {
    const lines = getFunctionLikeLines(fn)
    const startLine = fn.getStartLineNumber()
    if (lines > 50) {
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'large-function',
        severity: 'error',
        message: `Function spans ${lines} lines (threshold: 50). AI tends to dump logic into single functions.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

function detectDebugLeftovers(file: SourceFile): DriftIssue[] {
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

  const lines = file.getFullText().split('\n')
  lines.forEach((lineContent, i) => {
    if (/\/\/\s*(TODO|FIXME|HACK|XXX|TEMP)\b/i.test(lineContent)) {
      if (hasIgnoreComment(file, i + 1)) return
      issues.push({
        rule: 'debug-leftover',
        severity: 'warning',
        message: `Unresolved marker found: ${lineContent.trim().slice(0, 60)}`,
        line: i + 1,
        column: 1,
        snippet: lineContent.trim().slice(0, 120),
      })
    }
  })

  return issues
}

function detectDeadCode(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  for (const imp of file.getImportDeclarations()) {
    for (const named of imp.getNamedImports()) {
      const name = named.getName()
      const refs = file.getDescendantsOfKind(SyntaxKind.Identifier).filter(
        (id) => id.getText() === name && id !== named.getNameNode()
      )
      if (refs.length === 0) {
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

function detectDuplicateFunctionNames(file: SourceFile): DriftIssue[] {
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

function detectAnyAbuse(file: SourceFile): DriftIssue[] {
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

function detectCatchSwallow(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  for (const tryCatch of file.getDescendantsOfKind(SyntaxKind.TryStatement)) {
    const catchClause = tryCatch.getCatchClause()
    if (!catchClause) continue
    const block = catchClause.getBlock()
    const stmts = block.getStatements()
    if (stmts.length === 0) {
      issues.push({
        rule: 'catch-swallow',
        severity: 'warning',
        message: `Empty catch block silently swallows errors. Classic AI pattern to make code "not throw".`,
        line: catchClause.getStartLineNumber(),
        column: catchClause.getStartLinePos(),
        snippet: getSnippet(catchClause, file),
      })
    }
  }
  return issues
}

function detectMissingReturnTypes(file: SourceFile): DriftIssue[] {
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

function calculateScore(issues: DriftIssue[]): number {
  let raw = 0
  for (const issue of issues) {
    raw += RULE_WEIGHTS[issue.rule]?.weight ?? 5
  }
  return Math.min(100, raw)
}

export function analyzeFile(file: SourceFile): FileReport {
  if (isFileIgnored(file)) {
    return {
      path: file.getFilePath(),
      issues: [],
      score: 0,
    }
  }

  const issues: DriftIssue[] = [
    ...detectLargeFile(file),
    ...detectLargeFunctions(file),
    ...detectDebugLeftovers(file),
    ...detectDeadCode(file),
    ...detectDuplicateFunctionNames(file),
    ...detectAnyAbuse(file),
    ...detectCatchSwallow(file),
    ...detectMissingReturnTypes(file),
  ]

  return {
    path: file.getFilePath(),
    issues,
    score: calculateScore(issues),
  }
}

export function analyzeProject(targetPath: string): FileReport[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  })

  project.addSourceFilesAtPaths([
    `${targetPath}/**/*.ts`,
    `${targetPath}/**/*.tsx`,
    `${targetPath}/**/*.js`,
    `${targetPath}/**/*.jsx`,
    `!${targetPath}/**/node_modules/**`,
    `!${targetPath}/**/dist/**`,
    `!${targetPath}/**/.next/**`,
    `!${targetPath}/**/build/**`,
    `!${targetPath}/**/*.d.ts`,
    `!${targetPath}/**/*.test.*`,
    `!${targetPath}/**/*.spec.*`,
  ])

  return project.getSourceFiles().map(analyzeFile)
}
