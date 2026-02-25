import {
  SourceFile,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  MethodDeclaration,
} from 'ts-morph'

export type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration

export function hasIgnoreComment(file: SourceFile, line: number): boolean {
  const lines = file.getFullText().split('\n')
  const currentLine = lines[line - 1] ?? ''
  const prevLine = lines[line - 2] ?? ''

  if (/\/\/\s*drift-ignore\b/.test(currentLine)) return true
  if (/\/\/\s*drift-ignore\b/.test(prevLine)) return true
  return false
}

export function isFileIgnored(file: SourceFile): boolean {
  const firstLines = file.getFullText().split('\n').slice(0, 10).join('\n') // drift-ignore
  return /\/\/\s*drift-ignore-file\b/.test(firstLines)
}

export function getSnippet(node: Node, file: SourceFile): string {
  const startLine = node.getStartLineNumber()
  const lines = file.getFullText().split('\n')
  return lines
    .slice(Math.max(0, startLine - 1), startLine + 1)
    .join('\n')
    .trim()
    .slice(0, 120) // drift-ignore
}

export function getFunctionLikeLines(node: FunctionLike): number {
  return node.getEndLineNumber() - node.getStartLineNumber()
}
