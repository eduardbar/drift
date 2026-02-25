import { SourceFile, SyntaxKind, Node } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment, getSnippet, type FunctionLike } from './shared.js'

/**
 * Cyclomatic complexity: count decision points in a function.
 * Each if/else if/ternary/?:/for/while/do/case/catch/&&/|| adds 1.
 * Threshold: > 10 is considered high complexity.
 */
export function getCyclomaticComplexity(fn: FunctionLike): number {
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
export function getMaxNestingDepth(fn: FunctionLike): number {
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

export function detectDeepNesting(file: SourceFile): DriftIssue[] {
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
export function detectTooManyParams(file: SourceFile): DriftIssue[] {
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
export function detectHighCoupling(file: SourceFile): DriftIssue[] {
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
export function detectPromiseStyleMix(file: SourceFile): DriftIssue[] {
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
export function detectMagicNumbers(file: SourceFile): DriftIssue[] {
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
export function detectCommentContradiction(file: SourceFile): DriftIssue[] {
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
