import {
  SourceFile,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  MethodDeclaration,
  SyntaxKind,
} from 'ts-morph'

export type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration

const fileLinesCache = new WeakMap<SourceFile, string[]>()
const functionLikesCache = new WeakMap<SourceFile, FunctionLike[]>()

export function getFileLines(file: SourceFile): string[] {
  const cached = fileLinesCache.get(file)
  if (cached) return cached

  const lines = file.getFullText().split('\n')
  fileLinesCache.set(file, lines)
  return lines
}

export function collectFunctionLikes(file: SourceFile): FunctionLike[] {
  const cached = functionLikesCache.get(file)
  if (cached) return cached

  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  functionLikesCache.set(file, fns)
  return fns
}

export function hasIgnoreComment(file: SourceFile, line: number): boolean {
  const lines = getFileLines(file)
  const currentLine = lines[line - 1] ?? ''
  const prevLine = lines[line - 2] ?? ''

  if (/\/\/\s*drift-ignore\b/.test(currentLine)) return true
  if (/\/\/\s*drift-ignore\b/.test(prevLine)) return true
  return false
}

export function isFileIgnored(file: SourceFile): boolean {
  const firstLines = getFileLines(file).slice(0, 10).join('\n') // drift-ignore
  return /\/\/\s*drift-ignore-file\b/.test(firstLines)
}

export function getSnippet(node: Node, file: SourceFile): string {
  const startLine = node.getStartLineNumber()
  const lines = getFileLines(file)
  return lines
    .slice(Math.max(0, startLine - 1), startLine + 1)
    .join('\n')
    .trim()
    .slice(0, 120) // drift-ignore
}

export function getFunctionLikeLines(node: FunctionLike): number {
  return node.getEndLineNumber() - node.getStartLineNumber()
}
