// drift-ignore-file
import { SourceFile, SyntaxKind } from 'ts-morph'
import type { DriftIssue } from '../types.js'

export function detectOverCommented(file: SourceFile): DriftIssue[] {
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

export function detectHardcodedConfig(file: SourceFile): DriftIssue[] {
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

export function detectInconsistentErrorHandling(file: SourceFile): DriftIssue[] {
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

export function detectUnnecessaryAbstraction(file: SourceFile): DriftIssue[] {
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

export function detectNamingInconsistency(file: SourceFile): DriftIssue[] {
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
