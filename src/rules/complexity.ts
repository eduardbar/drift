import { SourceFile, SyntaxKind } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment, getSnippet, type FunctionLike } from './shared.js'

const COMPLEXITY_THRESHOLD = 10

const INCREMENT_KINDS = [
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]

function getCyclomaticComplexity(fn: FunctionLike): number {
  let complexity = 1

  for (const kind of INCREMENT_KINDS) {
    complexity += fn.getDescendantsOfKind(kind).length
  }

  return complexity
}

export function detectHighComplexity(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  for (const fn of fns) {
    const complexity = getCyclomaticComplexity(fn)
    if (complexity > COMPLEXITY_THRESHOLD) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'high-complexity',
        severity: 'error',
        message: `Cyclomatic complexity is ${complexity} (threshold: ${COMPLEXITY_THRESHOLD}). AI generates correct code, not simple code.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}
