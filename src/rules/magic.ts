import { SourceFile, SyntaxKind } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment, getSnippet } from './shared.js'

const ALLOWED_NUMBERS = new Set([0, 1, -1, 2, 100])

export function detectMagicNumbers(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  for (const node of file.getDescendantsOfKind(SyntaxKind.NumericLiteral)) {
    const value = Number(node.getLiteralValue())
    if (ALLOWED_NUMBERS.has(value)) continue

    const parent = node.getParent()
    if (!parent) continue

    const parentKind = parent.getKind()
    if (
      parentKind === SyntaxKind.VariableDeclaration ||
      parentKind === SyntaxKind.PropertyAssignment ||
      parentKind === SyntaxKind.EnumMember ||
      parentKind === SyntaxKind.Parameter
    ) continue

    const line = node.getStartLineNumber()
    if (hasIgnoreComment(file, line)) continue

    issues.push({
      rule: 'magic-number',
      severity: 'info',
      message: `Magic number ${value} used directly in logic. Extract to a named constant.`,
      line,
      column: node.getStartLinePos(),
      snippet: getSnippet(node, file),
    })
  }
  return issues
}
