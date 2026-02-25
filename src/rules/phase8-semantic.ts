// drift-ignore-file

import * as crypto from 'node:crypto'
import {
  SourceFile,
  SyntaxKind,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  MethodDeclaration,
} from 'ts-morph'
import type { DriftIssue } from '../types.js'

export type FunctionLikeNode = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration

/** Normalize a function body to a canonical string (Type-2 clone detection).
 *  Variable names, parameter names, and numeric/string literals are replaced
 *  with canonical tokens so that two functions with identical logic but
 *  different identifiers produce the same fingerprint.
 */
function buildSubstitutionMap(fn: FunctionLikeNode): Map<string, string> {
  const subst = new Map<string, string>()

  for (const [i, param] of fn.getParameters().entries()) {
    const name = param.getName()
    if (name && name !== '_') subst.set(name, `P${i}`)
  }

  let varIdx = 0
  fn.forEachDescendant(node => {
    if (node.getKind() === SyntaxKind.VariableDeclaration) {
      const nameNode = (node as import('ts-morph').VariableDeclaration).getNameNode()
      if (nameNode.getKind() === SyntaxKind.Identifier) {
        const name = nameNode.getText()
        if (!subst.has(name)) subst.set(name, `V${varIdx++}`)
      }
    }
  })

  return subst
}

function serializeNode(node: Node, subst: Map<string, string>): string {
  const kind = node.getKindName()

  switch (node.getKind()) {
    case SyntaxKind.Identifier: {
      const text = node.getText()
      return subst.get(text) ?? text
    }
    case SyntaxKind.NumericLiteral:
      return 'NL'
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return 'SL'
    case SyntaxKind.TrueKeyword:
      return 'TRUE'
    case SyntaxKind.FalseKeyword:
      return 'FALSE'
    case SyntaxKind.NullKeyword:
      return 'NULL'
  }

  const children = node.getChildren()
  if (children.length === 0) return kind

  const childStr = children.map(c => serializeNode(c, subst)).join('|')
  return `${kind}(${childStr})`
}

export function normalizeFunctionBody(fn: FunctionLikeNode): string {
  const subst = buildSubstitutionMap(fn)

  const body = fn.getBody()
  if (!body) return ''
  return serializeNode(body, subst)
}

/** Return a SHA-256 fingerprint for a function body (normalized). */
export function fingerprintFunction(fn: FunctionLikeNode): string {
  const normalized = normalizeFunctionBody(fn)
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/** Return all function-like nodes from a SourceFile that are worth comparing:
 *  - At least MIN_LINES lines in their body
 *  - Not test helpers (describe/it/test/beforeEach/afterEach)
 */
const MIN_LINES = 8

export function collectFunctions(sf: SourceFile): Array<{ fn: FunctionLikeNode; name: string; line: number; col: number }> {
  const results: Array<{ fn: FunctionLikeNode; name: string; line: number; col: number }> = []

  const kinds = [
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction,
    SyntaxKind.MethodDeclaration,
  ] as const

  for (const kind of kinds) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      const body = (node as FunctionLikeNode).getBody()
      if (!body) continue

      const start = body.getStartLineNumber()
      const end = body.getEndLineNumber()
      if (end - start + 1 < MIN_LINES) continue

      // Skip test-framework helpers
      const name = node.getKind() === SyntaxKind.FunctionDeclaration
        ? (node as FunctionDeclaration).getName() ?? '<anonymous>'
        : node.getKind() === SyntaxKind.MethodDeclaration
          ? (node as MethodDeclaration).getName()
          : '<anonymous>'

      if (['describe', 'it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(name)) continue

      const pos = node.getStart()
      const lineInfo = sf.getLineAndColumnAtPos(pos)

      results.push({ fn: node as FunctionLikeNode, name, line: lineInfo.line, col: lineInfo.column })
    }
  }

  return results
}

export function calculateScore(issues: DriftIssue[], ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>): number {
  let raw = 0
  for (const issue of issues) {
    raw += ruleWeights[issue.rule]?.weight ?? 5
  }
  return Math.min(100, raw)
}
