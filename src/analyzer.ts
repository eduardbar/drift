import * as fs from 'node:fs'
import * as path from 'node:path'
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
import type { DriftIssue, FileReport, DriftConfig, LayerDefinition, ModuleBoundary } from './types.js'

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
  // Phase 1: complexity detection
  'high-complexity':          { severity: 'error',   weight: 15 },
  'deep-nesting':             { severity: 'warning', weight: 12 },
  'too-many-params':          { severity: 'warning', weight: 8  },
  'high-coupling':            { severity: 'warning', weight: 10 },
  'promise-style-mix':        { severity: 'warning', weight: 7  },
  // Phase 2: cross-file dead code
  'unused-export':            { severity: 'warning', weight: 8  },
  'dead-file':                { severity: 'warning', weight: 10 },
  'unused-dependency':        { severity: 'warning', weight: 6  },
  // Phase 3: architectural boundaries
  'circular-dependency':      { severity: 'error',   weight: 14 },
  // Phase 3b/c: layer and module boundary enforcement (require drift.config.ts)
  'layer-violation':          { severity: 'error',   weight: 16 },
  'cross-boundary-import':    { severity: 'warning', weight: 10 },
  // Phase 5: AI authorship heuristics
  'over-commented':                { severity: 'info',    weight: 4  },
  'hardcoded-config':              { severity: 'warning', weight: 10 },
  'inconsistent-error-handling':   { severity: 'warning', weight: 8  },
  'unnecessary-abstraction':       { severity: 'warning', weight: 7  },
  'naming-inconsistency':          { severity: 'warning', weight: 6  },
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

// ---------------------------------------------------------------------------
// Existing rules
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase 1: complexity detection rules
// ---------------------------------------------------------------------------

/**
 * Cyclomatic complexity: count decision points in a function.
 * Each if/else if/ternary/?:/for/while/do/case/catch/&&/|| adds 1.
 * Threshold: > 10 is considered high complexity.
 */
function getCyclomaticComplexity(fn: FunctionLike): number {
  let complexity = 1 // base path

  const incrementKinds = [
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.CaseClause,
    SyntaxKind.CatchClause,
    SyntaxKind.ConditionalExpression,  // ternary
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.QuestionQuestionToken,  // ??
  ]

  for (const kind of incrementKinds) {
    complexity += fn.getDescendantsOfKind(kind).length
  }

  return complexity
}

function detectHighComplexity(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  for (const fn of fns) {
    const complexity = getCyclomaticComplexity(fn)
    if (complexity > 10) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'high-complexity',
        severity: 'error',
        message: `Cyclomatic complexity is ${complexity} (threshold: 10). AI generates correct code, not simple code.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

/**
 * Deep nesting: count the maximum nesting depth of control flow inside a function.
 * Counts: if, for, while, do, try, switch.
 * Threshold: > 3 levels.
 */
function getMaxNestingDepth(fn: FunctionLike): number {
  const nestingKinds = new Set([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.TryStatement,
    SyntaxKind.SwitchStatement,
  ])

  let maxDepth = 0

  function walk(node: Node, depth: number): void {
    if (nestingKinds.has(node.getKind())) {
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

function detectDeepNesting(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  for (const fn of fns) {
    const depth = getMaxNestingDepth(fn)
    if (depth > 3) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'deep-nesting',
        severity: 'warning',
        message: `Maximum nesting depth is ${depth} (threshold: 3). Deep nesting is the #1 readability killer.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

/**
 * Too many parameters: functions with more than 4 parameters.
 * AI avoids refactoring parameters into objects/options bags.
 */
function detectTooManyParams(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fns: FunctionLike[] = [
    ...file.getFunctions(),
    ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...file.getClasses().flatMap((c) => c.getMethods()),
  ]

  for (const fn of fns) {
    const paramCount = fn.getParameters().length
    if (paramCount > 4) {
      const startLine = fn.getStartLineNumber()
      if (hasIgnoreComment(file, startLine)) continue
      issues.push({
        rule: 'too-many-params',
        severity: 'warning',
        message: `Function has ${paramCount} parameters (threshold: 4). AI avoids refactoring into options objects.`,
        line: startLine,
        column: fn.getStartLinePos(),
        snippet: getSnippet(fn, file),
      })
    }
  }
  return issues
}

/**
 * High coupling: files with more than 10 distinct import sources.
 * AI imports broadly without considering module cohesion.
 */
function detectHighCoupling(file: SourceFile): DriftIssue[] {
  const imports = file.getImportDeclarations()
  const sources = new Set(imports.map((i) => i.getModuleSpecifierValue()))

  if (sources.size > 10) {
    return [
      {
        rule: 'high-coupling',
        severity: 'warning',
        message: `File imports from ${sources.size} distinct modules (threshold: 10). High coupling makes refactoring dangerous.`,
        line: 1,
        column: 1,
        snippet: `// ${sources.size} import sources`,
      },
    ]
  }
  return []
}

/**
 * Promise style mix: async/await and .then()/.catch() used in the same file.
 * AI generates both styles without consistency.
 */
function detectPromiseStyleMix(file: SourceFile): DriftIssue[] {
  const text = file.getFullText()

  // detect .then( or .catch( calls (property access on a promise)
  const hasThen = file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).some((node) => {
    const name = node.getName()
    return name === 'then' || name === 'catch'
  })

  // detect async keyword usage
  const hasAsync =
    file.getDescendantsOfKind(SyntaxKind.AsyncKeyword).length > 0 ||
    /\bawait\b/.test(text)

  if (hasThen && hasAsync) {
    return [
      {
        rule: 'promise-style-mix',
        severity: 'warning',
        message: `File mixes async/await with .then()/.catch(). AI generates both styles without picking one.`,
        line: 1,
        column: 1,
        snippet: `// mixed promise styles detected`,
      },
    ]
  }
  return []
}

/**
 * Magic numbers: numeric literals used directly in logic outside of named constants.
 * Excludes 0, 1, -1 (universally understood) and array indices in obvious patterns.
 */
function detectMagicNumbers(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const ALLOWED = new Set([0, 1, -1, 2, 100])

  for (const node of file.getDescendantsOfKind(SyntaxKind.NumericLiteral)) {
    const value = Number(node.getLiteralValue())
    if (ALLOWED.has(value)) continue

    // Skip: variable/const initializers at top level (those ARE the named constants)
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

/**
 * Comment contradiction: comments that restate exactly what the code does.
 * Classic AI pattern — documents the obvious instead of the why.
 * Detects: "// increment counter" above counter++, "// return x" above return x, etc.
 */
function detectCommentContradiction(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const lines = file.getFullText().split('\n')

  // Patterns: comment that is a near-literal restatement of the next line
  const trivialCommentPatterns = [
    // "// return ..." above a return statement
    { comment: /\/\/\s*return\b/i,         code: /^\s*return\b/ },
    // "// increment ..." or "// increase ..." above x++ or x += 1
    { comment: /\/\/\s*(increment|increase|add\s+1|plus\s+1)\b/i, code: /\+\+|(\+= ?1)\b/ },
    // "// decrement ..." above x-- or x -= 1
    { comment: /\/\/\s*(decrement|decrease|subtract\s+1|minus\s+1)\b/i, code: /--|(-= ?1)\b/ },
    // "// log ..." above console.log
    { comment: /\/\/\s*log\b/i,            code: /console\.(log|warn|error)/ },
    // "// set ... to ..." or "// assign ..." above assignment
    { comment: /\/\/\s*(set|assign)\b/i,   code: /^\s*\w[\w.[\]]*\s*=(?!=)/ },
    // "// call ..." above a function call
    { comment: /\/\/\s*call\b/i,           code: /^\s*\w[\w.]*\(/ },
    // "// declare ..." or "// define ..." or "// create ..." above const/let/var
    { comment: /\/\/\s*(declare|define|create|initialize)\b/i, code: /^\s*(const|let|var)\b/ },
    // "// check if ..." above an if statement
    { comment: /\/\/\s*check\s+if\b/i,     code: /^\s*if\s*\(/ },
    // "// loop ..." or "// iterate ..." above for/while
    { comment: /\/\/\s*(loop|iterate|for each|foreach)\b/i, code: /^\s*(for|while)\b/ },
    // "// import ..." above an import
    { comment: /\/\/\s*import\b/i,         code: /^\s*import\b/ },
  ]

  for (let i = 0; i < lines.length - 1; i++) {
    const commentLine = lines[i].trim()
    const nextLine = lines[i + 1]

    for (const { comment, code } of trivialCommentPatterns) {
      if (comment.test(commentLine) && code.test(nextLine)) {
        if (hasIgnoreComment(file, i + 1)) continue
        issues.push({
          rule: 'comment-contradiction',
          severity: 'warning',
          message: `Comment restates what the code already says. AI documents the obvious instead of the why.`,
          line: i + 1,
          column: 1,
          snippet: `${commentLine.slice(0, 60)}\n${nextLine.trim().slice(0, 60)}`,
        })
        break // one issue per comment line max
      }
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Phase 5: AI authorship heuristics
// ---------------------------------------------------------------------------

function detectOverCommented(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  for (const fn of file.getFunctions()) {
    const body = fn.getBody()
    if (!body) continue

    const bodyText = body.getText()
    const lines = bodyText.split('\n')
    const totalLines = lines.length

    if (totalLines < 6) continue

    let commentLines = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
        commentLines++
      }
    }

    const ratio = commentLines / totalLines
    if (ratio >= 0.4) {
      issues.push({
        rule: 'over-commented',
        severity: 'info',
        message: `Function has ${Math.round(ratio * 100)}% comment density (${commentLines}/${totalLines} lines). AI documents the obvious instead of the why.`,
        line: fn.getStartLineNumber(),
        column: fn.getStartLinePos(),
        snippet: fn.getName() ? `function ${fn.getName()}` : '(anonymous function)',
      })
    }
  }

  for (const cls of file.getClasses()) {
    for (const method of cls.getMethods()) {
      const body = method.getBody()
      if (!body) continue

      const bodyText = body.getText()
      const lines = bodyText.split('\n')
      const totalLines = lines.length

      if (totalLines < 6) continue

      let commentLines = 0
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
          commentLines++
        }
      }

      const ratio = commentLines / totalLines
      if (ratio >= 0.4) {
        issues.push({
          rule: 'over-commented',
          severity: 'info',
          message: `Method '${method.getName()}' has ${Math.round(ratio * 100)}% comment density (${commentLines}/${totalLines} lines). AI documents the obvious instead of the why.`,
          line: method.getStartLineNumber(),
          column: method.getStartLinePos(),
          snippet: `${cls.getName()}.${method.getName()}`,
        })
      }
    }
  }

  return issues
}

function detectHardcodedConfig(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  const CONFIG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^https?:\/\//i,                          label: 'HTTP/HTTPS URL' },
    { pattern: /^wss?:\/\//i,                            label: 'WebSocket URL' },
    { pattern: /^mongodb(\+srv)?:\/\//i,                 label: 'MongoDB connection string' },
    { pattern: /^postgres(?:ql)?:\/\//i,                 label: 'PostgreSQL connection string' },
    { pattern: /^mysql:\/\//i,                           label: 'MySQL connection string' },
    { pattern: /^redis:\/\//i,                           label: 'Redis connection string' },
    { pattern: /^amqps?:\/\//i,                          label: 'AMQP connection string' },
    { pattern: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,  label: 'IP address' },
    { pattern: /^:[0-9]{2,5}$/,                          label: 'Port number in string' },
    { pattern: /^\/[a-z]/i,                              label: 'Absolute file path' },
    { pattern: /localhost(:[0-9]+)?/i,                   label: 'localhost reference' },
  ]

  const filePath = file.getFilePath().replace(/\\/g, '/')
  if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
    return issues
  }

  for (const node of file.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const value = node.getLiteralValue()
    if (!value || value.length < 4) continue

    const parent = node.getParent()
    if (!parent) continue
    const parentKind = parent.getKindName()
    if (
      parentKind === 'ImportDeclaration' ||
      parentKind === 'ExportDeclaration' ||
      (parentKind === 'CallExpression' && parent.getText().startsWith('import('))
    ) continue

    for (const { pattern, label } of CONFIG_PATTERNS) {
      if (pattern.test(value)) {
        issues.push({
          rule: 'hardcoded-config',
          severity: 'warning',
          message: `Hardcoded ${label} detected. AI skips environment variables — extract to process.env or a config module.`,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          snippet: value.length > 60 ? value.slice(0, 60) + '...' : value,
        })
        break
      }
    }
  }

  return issues
}

function detectInconsistentErrorHandling(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  let hasTryCatch = false
  let hasDotCatch = false
  let hasThenErrorHandler = false
  let firstLine = 0

  // Detectar try/catch
  const tryCatches = file.getDescendantsOfKind(SyntaxKind.TryStatement)
  if (tryCatches.length > 0) {
    hasTryCatch = true
    firstLine = firstLine || tryCatches[0].getStartLineNumber()
  }

  // Detectar .catch(handler) en call expressions
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    if (expr.getKindName() === 'PropertyAccessExpression') {
      const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      const propName = propAccess.getName()
      if (propName === 'catch') {
        // Verificar que tiene al menos un argumento (handler real, no .catch() vacío)
        if (call.getArguments().length > 0) {
          hasDotCatch = true
          if (!firstLine) firstLine = call.getStartLineNumber()
        }
      }
      // Detectar .then(onFulfilled, onRejected) — segundo argumento = error handler
      if (propName === 'then' && call.getArguments().length >= 2) {
        hasThenErrorHandler = true
        if (!firstLine) firstLine = call.getStartLineNumber()
      }
    }
  }

  const stylesUsed = [hasTryCatch, hasDotCatch, hasThenErrorHandler].filter(Boolean).length

  if (stylesUsed >= 2) {
    const styles: string[] = []
    if (hasTryCatch) styles.push('try/catch')
    if (hasDotCatch) styles.push('.catch()')
    if (hasThenErrorHandler) styles.push('.then(_, handler)')

    issues.push({
      rule: 'inconsistent-error-handling',
      severity: 'warning',
      message: `Mixed error handling styles: ${styles.join(', ')}. AI uses whatever pattern it saw last — pick one and stick to it.`,
      line: firstLine || 1,
      column: 1,
      snippet: styles.join(' + '),
    })
  }

  return issues
}

function detectUnnecessaryAbstraction(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const fileText = file.getFullText()

  // Interfaces con un solo método
  for (const iface of file.getInterfaces()) {
    const methods = iface.getMethods()
    const properties = iface.getProperties()

    // Solo reportar si tiene exactamente 1 método y 0 propiedades (abstracción pura de comportamiento)
    if (methods.length !== 1 || properties.length !== 0) continue

    const ifaceName = iface.getName()

    // Contar cuántas veces aparece el nombre en el archivo (excluyendo la declaración misma)
    const usageCount = (fileText.match(new RegExp(`\\b${ifaceName}\\b`, 'g')) ?? []).length
    // La declaración misma cuenta como 1 uso, implementaciones cuentan como 1 cada una
    // Si usageCount <= 2 (declaración + 1 uso), es candidata a innecesaria
    if (usageCount <= 2) {
      issues.push({
        rule: 'unnecessary-abstraction',
        severity: 'warning',
        message: `Interface '${ifaceName}' has 1 method and is used only once. AI creates abstractions preemptively — YAGNI.`,
        line: iface.getStartLineNumber(),
        column: iface.getStartLinePos(),
        snippet: `interface ${ifaceName} { ${methods[0].getName()}(...) }`,
      })
    }
  }

  // Clases abstractas con un solo método abstracto y sin implementaciones en el archivo
  for (const cls of file.getClasses()) {
    if (!cls.isAbstract()) continue

    const abstractMethods = cls.getMethods().filter(m => m.isAbstract())
    const concreteMethods = cls.getMethods().filter(m => !m.isAbstract())

    if (abstractMethods.length !== 1 || concreteMethods.length !== 0) continue

    const clsName = cls.getName() ?? ''
    const usageCount = (fileText.match(new RegExp(`\\b${clsName}\\b`, 'g')) ?? []).length

    if (usageCount <= 2) {
      issues.push({
        rule: 'unnecessary-abstraction',
        severity: 'warning',
        message: `Abstract class '${clsName}' has 1 abstract method and is extended nowhere in this file. AI over-engineers single-use code.`,
        line: cls.getStartLineNumber(),
        column: cls.getStartLinePos(),
        snippet: `abstract class ${clsName}`,
      })
    }
  }

  return issues
}

function detectNamingInconsistency(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []

  const isCamelCase = (name: string) => /^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)
  const isSnakeCase = (name: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function checkFunction(fn: any): void {
    const vars = fn.getVariableDeclarations()
    if (vars.length < 3) return  // muy pocas vars para ser significativo

    let camelCount = 0
    let snakeCount = 0
    const snakeExamples: string[] = []
    const camelExamples: string[] = []

    for (const v of vars) {
      const name = v.getName()
      if (isCamelCase(name)) {
        camelCount++
        if (camelExamples.length < 2) camelExamples.push(name)
      } else if (isSnakeCase(name)) {
        snakeCount++
        if (snakeExamples.length < 2) snakeExamples.push(name)
      }
    }

    if (camelCount >= 1 && snakeCount >= 1) {
      issues.push({
        rule: 'naming-inconsistency',
        severity: 'warning',
        message: `Mixed naming conventions: camelCase (${camelExamples.join(', ')}) and snake_case (${snakeExamples.join(', ')}) in the same scope. AI mixes conventions from different training examples.`,
        line: fn.getStartLineNumber(),
        column: fn.getStartLinePos(),
        snippet: `camelCase: ${camelExamples[0]} / snake_case: ${snakeExamples[0]}`,
      })
    }
  }

  for (const fn of file.getFunctions()) {
    checkFunction(fn)
  }

  for (const cls of file.getClasses()) {
    for (const method of cls.getMethods()) {
      checkFunction(method)
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function calculateScore(issues: DriftIssue[]): number {
  let raw = 0
  for (const issue of issues) {
    raw += RULE_WEIGHTS[issue.rule]?.weight ?? 5
  }
  return Math.min(100, raw)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
    // Phase 1: complexity
    ...detectHighComplexity(file),
    ...detectDeepNesting(file),
    ...detectTooManyParams(file),
    ...detectHighCoupling(file),
    ...detectPromiseStyleMix(file),
    // Stubs now implemented
    ...detectMagicNumbers(file),
    ...detectCommentContradiction(file),
    // Phase 5: AI authorship heuristics
    ...detectOverCommented(file),
    ...detectHardcodedConfig(file),
    ...detectInconsistentErrorHandling(file),
    ...detectUnnecessaryAbstraction(file),
    ...detectNamingInconsistency(file),
  ]

  return {
    path: file.getFilePath(),
    issues,
    score: calculateScore(issues),
  }
}

export function analyzeProject(targetPath: string, config?: DriftConfig): FileReport[] {
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

  const sourceFiles = project.getSourceFiles()

  // Phase 1: per-file analysis
  const reports: FileReport[] = sourceFiles.map(analyzeFile)
  const reportByPath = new Map<string, FileReport>()
  for (const r of reports) reportByPath.set(r.path, r)

  // Phase 2: cross-file analysis — build import graph first
  const allImportedPaths = new Set<string>()   // absolute paths of files that are imported
  const allImportedNames = new Map<string, Set<string>>() // file path → set of imported names
  const allLiteralImports = new Set<string>()  // raw module specifiers (for unused-dependency)
  const importGraph = new Map<string, Set<string>>() // Phase 3: filePath → Set of imported filePaths

  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    for (const decl of sf.getImportDeclarations()) {
      const moduleSpecifier = decl.getModuleSpecifierValue()
      allLiteralImports.add(moduleSpecifier)

      // Resolve to absolute path for dead-file / unused-export
      const resolved = decl.getModuleSpecifierSourceFile()
      if (resolved) {
        const resolvedPath = resolved.getFilePath()
        allImportedPaths.add(resolvedPath)

        // Phase 3: populate directed import graph
        if (!importGraph.has(sfPath)) importGraph.set(sfPath, new Set())
        importGraph.get(sfPath)!.add(resolvedPath)

        // Collect named imports { A, B } and default imports
        const named = decl.getNamedImports().map(n => n.getName())
        const def = decl.getDefaultImport()?.getText()
        const ns = decl.getNamespaceImport()?.getText()

        if (!allImportedNames.has(resolvedPath)) {
          allImportedNames.set(resolvedPath, new Set())
        }
        const nameSet = allImportedNames.get(resolvedPath)!
        for (const n of named) nameSet.add(n)
        if (def) nameSet.add('default')
        if (ns) nameSet.add('*') // namespace import — counts all exports as used
      }
    }

    // Also register re-exports: export { X, Y } from './module'
    // These count as "using" X and Y from the source module
    for (const exportDecl of sf.getExportDeclarations()) {
      const reExportedModule = exportDecl.getModuleSpecifierSourceFile()
      if (!reExportedModule) continue

      const reExportedPath = reExportedModule.getFilePath()
      allImportedPaths.add(reExportedPath)

      if (!allImportedNames.has(reExportedPath)) {
        allImportedNames.set(reExportedPath, new Set())
      }
      const nameSet = allImportedNames.get(reExportedPath)!

      const namedExports = exportDecl.getNamedExports()
      if (namedExports.length === 0) {
        // export * from './module' — namespace re-export, all names used
        nameSet.add('*')
      } else {
        for (const ne of namedExports) nameSet.add(ne.getName())
      }
    }
  }

  // Detect unused-export and dead-file per source file
  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    const report = reportByPath.get(sfPath)
    if (!report) continue

    // dead-file: file is never imported by anyone
    // Exclude entry-point candidates: index.ts, main.ts, cli.ts, app.ts, bin files
    const basename = path.basename(sfPath)
    const isBinFile = sfPath.replace(/\\/g, '/').includes('/bin/')
    const isEntryPoint = /^(index|main|cli|app)\.(ts|tsx|js|jsx)$/.test(basename) || isBinFile
    if (!isEntryPoint && !allImportedPaths.has(sfPath)) {
      const issue: DriftIssue = {
        rule: 'dead-file',
        severity: RULE_WEIGHTS['dead-file'].severity,
        message: 'File is never imported — may be dead code',
        line: 1,
        column: 1,
        snippet: basename,
      }
      report.issues.push(issue)
      report.score = calculateScore(report.issues)
    }

    // unused-export: named exports not imported anywhere
    // Skip barrel files (index.ts) — their entire surface is the public API
    const isBarrel = /^index\.(ts|tsx|js|jsx)$/.test(basename)
    const importedNamesForFile = allImportedNames.get(sfPath)
    const hasNamespaceImport = importedNamesForFile?.has('*') ?? false
    if (!isBarrel && !hasNamespaceImport) {
      for (const exportDecl of sf.getExportDeclarations()) {
        for (const namedExport of exportDecl.getNamedExports()) {
          const name = namedExport.getName()
          if (!importedNamesForFile?.has(name)) {
            const line = namedExport.getStartLineNumber()
            const issue: DriftIssue = {
              rule: 'unused-export',
              severity: RULE_WEIGHTS['unused-export'].severity,
              message: `'${name}' is exported but never imported`,
              line,
              column: 1,
              snippet: namedExport.getText().slice(0, 80),
            }
            report.issues.push(issue)
            report.score = calculateScore(report.issues)
          }
        }
      }

      // Also check inline export declarations (export function foo, export const bar)
      for (const exportSymbol of sf.getExportedDeclarations()) {
        const [exportName, declarations] = [exportSymbol[0], exportSymbol[1]]
        if (exportName === 'default') continue
        if (importedNamesForFile?.has(exportName)) continue

        for (const decl of declarations) {
          // Skip if this is a re-export from another file
          if (decl.getSourceFile().getFilePath() !== sfPath) continue

          const line = decl.getStartLineNumber()
          const issue: DriftIssue = {
            rule: 'unused-export',
            severity: RULE_WEIGHTS['unused-export'].severity,
            message: `'${exportName}' is exported but never imported`,
            line,
            column: 1,
            snippet: decl.getText().split('\n')[0].slice(0, 80),
          }
          report.issues.push(issue)
          report.score = calculateScore(report.issues)
          break // one issue per export name is enough
        }
      }
    }
  }

  // Detect unused-dependency: packages in package.json never imported
  const pkgPath = path.join(targetPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    } catch {
      pkg = {}
    }

    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
    }

    const unusedDeps: string[] = []
    for (const depName of Object.keys(deps)) {
      // Skip type-only packages (@types/*)
      if (depName.startsWith('@types/')) continue

      // A dependency is "used" if any import specifier starts with the package name
      // (handles sub-paths like 'lodash/merge', 'date-fns/format', etc.)
      const isUsed = [...allLiteralImports].some(
        imp => imp === depName || imp.startsWith(depName + '/')
      )
      if (!isUsed) unusedDeps.push(depName)
    }

    if (unusedDeps.length > 0) {
      const pkgIssues: DriftIssue[] = unusedDeps.map(dep => ({
        rule: 'unused-dependency',
        severity: RULE_WEIGHTS['unused-dependency'].severity,
        message: `'${dep}' is in package.json but never imported`,
        line: 1,
        column: 1,
        snippet: `"${dep}"`,
      }))

      reports.push({
        path: pkgPath,
        issues: pkgIssues,
        score: calculateScore(pkgIssues),
      })
    }
  }

  // Phase 3: circular-dependency — DFS cycle detection
  function findCycles(graph: Map<string, Set<string>>): Array<string[]> {
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const cycles: Array<string[]> = []

    function dfs(node: string, stack: string[]): void {
      visited.add(node)
      inStack.add(node)
      stack.push(node)

      for (const neighbor of graph.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, stack)
        } else if (inStack.has(neighbor)) {
          // Found a cycle — extract the cycle portion from the stack
          const cycleStart = stack.indexOf(neighbor)
          cycles.push(stack.slice(cycleStart))
        }
      }

      stack.pop()
      inStack.delete(node)
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, [])
      }
    }

    return cycles
  }

  const cycles = findCycles(importGraph)

  // De-duplicate: each unique cycle (regardless of starting node) reported once per file
  const reportedCycleKeys = new Set<string>()

  for (const cycle of cycles) {
    const cycleKey = [...cycle].sort().join('|')
    if (reportedCycleKeys.has(cycleKey)) continue
    reportedCycleKeys.add(cycleKey)

    // Report on the first file in the cycle
    const firstFile = cycle[0]
    const report = reportByPath.get(firstFile)
    if (!report) continue

    const cycleDisplay = cycle
      .map(p => path.basename(p))
      .concat(path.basename(cycle[0])) // close the loop visually: A → B → C → A
      .join(' → ')

    const issue: DriftIssue = {
      rule: 'circular-dependency',
      severity: RULE_WEIGHTS['circular-dependency'].severity,
      message: `Circular dependency detected: ${cycleDisplay}`,
      line: 1,
      column: 1,
      snippet: cycleDisplay,
    }
    report.issues.push(issue)
    report.score = calculateScore(report.issues)
  }

  // ── Phase 3b: layer-violation ──────────────────────────────────────────
  if (config?.layers && config.layers.length > 0) {
    const { layers } = config

    function getLayer(filePath: string): LayerDefinition | undefined {
      const rel = filePath.replace(/\\/g, '/')
      return layers.find(layer =>
        layer.patterns.some(pattern => {
          const regexStr = pattern
            .replace(/\\/g, '/')
            .replace(/[.+^${}()|[\]]/g, '\\$&')
            .replace(/\*\*/g, '###DOUBLESTAR###')
            .replace(/\*/g, '[^/]*')
            .replace(/###DOUBLESTAR###/g, '.*')
          return new RegExp(`^${regexStr}`).test(rel)
        })
      )
    }

    for (const [filePath, imports] of importGraph.entries()) {
      const fileLayer = getLayer(filePath)
      if (!fileLayer) continue

      for (const importedPath of imports) {
        const importedLayer = getLayer(importedPath)
        if (!importedLayer) continue
        if (importedLayer.name === fileLayer.name) continue

        if (!fileLayer.canImportFrom.includes(importedLayer.name)) {
          const report = reportByPath.get(filePath)
          if (report) {
            const weight = RULE_WEIGHTS['layer-violation']?.weight ?? 5
            report.issues.push({
              rule: 'layer-violation',
              severity: 'error',
              message: `Layer '${fileLayer.name}' must not import from layer '${importedLayer.name}'`,
              line: 1,
              column: 1,
              snippet: `import from '${path.relative(targetPath, importedPath).replace(/\\/g, '/')}'`,
            })
            report.score = Math.min(100, report.score + weight)
          }
        }
      }
    }
  }

  // ── Phase 3c: cross-boundary-import ────────────────────────────────────
  if (config?.modules && config.modules.length > 0) {
    const { modules } = config

    function getModule(filePath: string): ModuleBoundary | undefined {
      const rel = filePath.replace(/\\/g, '/')
      return modules.find(m => rel.startsWith(m.root.replace(/\\/g, '/')))
    }

    for (const [filePath, imports] of importGraph.entries()) {
      const fileModule = getModule(filePath)
      if (!fileModule) continue

      for (const importedPath of imports) {
        const importedModule = getModule(importedPath)
        if (!importedModule) continue
        if (importedModule.name === fileModule.name) continue

        const allowedImports = fileModule.allowedExternalImports ?? []
        const relImported = importedPath.replace(/\\/g, '/')
        const isAllowed = allowedImports.some(allowed =>
          relImported.startsWith(allowed.replace(/\\/g, '/'))
        )

        if (!isAllowed) {
          const report = reportByPath.get(filePath)
          if (report) {
            const weight = RULE_WEIGHTS['cross-boundary-import']?.weight ?? 5
            report.issues.push({
              rule: 'cross-boundary-import',
              severity: 'warning',
              message: `Module '${fileModule.name}' must not import from module '${importedModule.name}'`,
              line: 1,
              column: 1,
              snippet: `import from '${path.relative(targetPath, importedPath).replace(/\\/g, '/')}'`,
            })
            report.score = Math.min(100, report.score + weight)
          }
        }
      }
    }
  }

  return reports
}
