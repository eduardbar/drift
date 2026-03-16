import { SourceFile, SyntaxKind, Node } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment, getSnippet, collectFunctionLikes, type FunctionLike } from './shared.js'

const NESTING_THRESHOLD = 3
const PARAMS_THRESHOLD = 4

const NESTING_KINDS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.TryStatement,
  SyntaxKind.SwitchStatement,
])

function getMaxNestingDepth(fn: FunctionLike): number {
  let maxDepth = 0

  function walk(node: Node, depth: number): void {
    if (NESTING_KINDS.has(node.getKind())) {
      depth++
      if (depth > maxDepth) maxDepth = depth
    }
    for (const child of node.getChildren()) {
      walk(child, depth)
    }
  }

  walk(fn, 0)
  return maxDepth
}

export function detectDeepNesting(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = collectFunctionLikes(file)

  for (const fn of fns) {
    const depth = getMaxNestingDepth(fn)
    if (depth > NESTING_THRESHOLD) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'deep-nesting',
        severity: 'warning',
        message: `Maximum nesting depth is ${depth} (threshold: ${NESTING_THRESHOLD}). Deep nesting is the #1 readability killer.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

export function detectTooManyParams(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = collectFunctionLikes(file)

  for (const fn of fns) {
    const paramCount = fn.getParameters().length
    if (paramCount > PARAMS_THRESHOLD) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'too-many-params',
        severity: 'warning',
        message: `Function has ${paramCount} parameters (threshold: ${PARAMS_THRESHOLD}). AI avoids refactoring into options objects.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}
