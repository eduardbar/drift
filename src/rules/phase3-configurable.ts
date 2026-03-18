import { SyntaxKind, type SourceFile } from 'ts-morph'
import type { DriftConfig, DriftIssue } from '../types.js'

const DB_IMPORT_PATTERNS = [
  /\bprisma\b/i,
  /\btypeorm\b/i,
  /\bsequelize\b/i,
  /\bmongoose\b/i,
  /\bknex\b/i,
  /\brepository\b/i,
  /\/db\//i,
  /\/database\//i,
]

const HTTP_IMPORT_PATTERNS = [
  /\bexpress\b/i,
  /\bfastify\b/i,
  /\bkoa\b/i,
  /\bhono\b/i,
  /^http$/i,
  /^https$/i,
]

function isControllerFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const segments = normalized.split('/')
  return segments.includes('controller') || segments.includes('controllers') || normalized.endsWith('controller.ts') || normalized.endsWith('controller.js')
}

function isServiceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const segments = normalized.split('/')
  return segments.includes('service') || segments.includes('services') || normalized.endsWith('service.ts') || normalized.endsWith('service.js')
}

function createIssue(rule: string, message: string, line: number, snippet: string): DriftIssue {
  return {
    rule,
    severity: 'warning',
    message,
    line,
    column: 1,
    snippet,
  }
}

export function detectControllerNoDb(file: SourceFile, config?: DriftConfig): DriftIssue[] {
  if (!config?.architectureRules?.controllerNoDb) return []
  if (!isControllerFile(file.getFilePath())) return []

  const issues: DriftIssue[] = []
  for (const decl of file.getImportDeclarations()) {
    const value = decl.getModuleSpecifierValue()
    if (DB_IMPORT_PATTERNS.some((pattern) => pattern.test(value))) {
      issues.push(createIssue(
        'controller-no-db',
        `Controller imports database module '${value}'. Controllers should delegate persistence through services.`,
        decl.getStartLineNumber(),
        value,
      ))
    }
  }

  return issues
}

export function detectServiceNoHttp(file: SourceFile, config?: DriftConfig): DriftIssue[] {
  if (!config?.architectureRules?.serviceNoHttp) return []
  if (!isServiceFile(file.getFilePath())) return []

  const issues: DriftIssue[] = []
  for (const decl of file.getImportDeclarations()) {
    const value = decl.getModuleSpecifierValue()
    if (HTTP_IMPORT_PATTERNS.some((pattern) => pattern.test(value))) {
      issues.push(createIssue(
        'service-no-http',
        `Service imports HTTP framework '${value}'. Keep transport concerns outside service layer.`,
        decl.getStartLineNumber(),
        value,
      ))
    }
  }

  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expressionText = call.getExpression().getText()
    if (/\bfetch\b/.test(expressionText)) {
      issues.push(createIssue(
        'service-no-http',
        'Service executes HTTP call directly (fetch). Move this to an adapter/client.',
        call.getStartLineNumber(),
        expressionText,
      ))
    }
  }

  return issues
}

export function detectMaxFunctionLines(file: SourceFile, config?: DriftConfig): DriftIssue[] {
  const maxLines = config?.architectureRules?.maxFunctionLines
  if (!maxLines || maxLines <= 0) return []

  const issues: DriftIssue[] = []

  collectFunctionLineIssues(file, maxLines, issues)
  collectMethodLineIssues(file, maxLines, issues)

  return issues
}

function countBodyLines(
  body: ReturnType<import('ts-morph').FunctionDeclaration['getBody']> | ReturnType<import('ts-morph').MethodDeclaration['getBody']>,
): number {
  if (!body) return 0
  return body.getEndLineNumber() - body.getStartLineNumber() - 1
}

function collectFunctionLineIssues(file: SourceFile, maxLines: number, issues: DriftIssue[]): void {
  for (const fn of file.getFunctions()) {
    const lines = countBodyLines(fn.getBody())
    if (lines <= maxLines) continue

    const functionName = fn.getName() ?? '(anonymous)'
    issues.push(createIssue(
      'max-function-lines',
      `Function '${functionName}' has ${lines} lines (max: ${maxLines}).`,
      fn.getStartLineNumber(),
      functionName,
    ))
  }
}

function collectMethodLineIssues(file: SourceFile, maxLines: number, issues: DriftIssue[]): void {
  for (const method of file.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
    const lines = countBodyLines(method.getBody())
    if (lines <= maxLines) continue

    issues.push(createIssue(
      'max-function-lines',
      `Method '${method.getName()}' has ${lines} lines (max: ${maxLines}).`,
      method.getStartLineNumber(),
      method.getName(),
    ))
  }
}
