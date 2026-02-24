import { analyzeFile } from '@eduardbar/drift'
import type { FileReport } from '@eduardbar/drift'
import { Project } from 'ts-morph'
import type { Rule } from 'eslint'

// Tipos auxiliares
type RuleType = 'problem' | 'suggestion' | 'layout'

// Mapeo rule → descripción legible
const RULE_DOCS: Record<string, { type: RuleType; description: string }> = {
  'large-file':                   { type: 'problem',    description: 'Files over 300 lines — AI dumps everything into one place' },
  'large-function':               { type: 'problem',    description: 'Functions over 50 lines — AI avoids splitting logic' },
  'duplicate-function-name':      { type: 'problem',    description: 'Near-identical function names — AI regenerates instead of reusing' },
  'high-complexity':              { type: 'problem',    description: 'Cyclomatic complexity > 10 — AI generates correct code, not simple code' },
  'circular-dependency':          { type: 'problem',    description: 'Circular import chains between modules' },
  'layer-violation':              { type: 'problem',    description: 'Import from a prohibited architectural layer (requires drift.config.ts)' },
  'debug-leftover':               { type: 'suggestion', description: 'console.log, TODO, FIXME comments left in production code' },
  'dead-code':                    { type: 'suggestion', description: 'Unused imports — AI imports more than it uses' },
  'any-abuse':                    { type: 'suggestion', description: 'Explicit any type — AI defaults to any when it cannot infer' },
  'catch-swallow':                { type: 'suggestion', description: 'Empty catch blocks — AI makes code not throw' },
  'comment-contradiction':        { type: 'suggestion', description: 'Comments that restate what the code already says' },
  'deep-nesting':                 { type: 'suggestion', description: 'Nesting depth > 3 — unreadable control flow' },
  'too-many-params':              { type: 'suggestion', description: 'Functions with more than 4 parameters' },
  'high-coupling':                { type: 'suggestion', description: 'Files importing from more than 10 modules' },
  'promise-style-mix':            { type: 'suggestion', description: 'async/await and .then() mixed in the same file' },
  'unused-export':                { type: 'suggestion', description: 'Named exports never imported anywhere in the project' },
  'dead-file':                    { type: 'suggestion', description: 'Files never imported by any other file' },
  'unused-dependency':            { type: 'suggestion', description: 'Packages in package.json never imported in source code' },
  'cross-boundary-import':        { type: 'suggestion', description: 'Module imports from another module outside allowed boundaries' },
  'hardcoded-config':             { type: 'suggestion', description: 'Hardcoded URLs, IPs, or connection strings — AI skips env vars' },
  'inconsistent-error-handling':  { type: 'suggestion', description: 'Mixed try/catch and .catch() patterns in the same file' },
  'unnecessary-abstraction':      { type: 'suggestion', description: 'Single-method interfaces or abstract classes never reused' },
  'naming-inconsistency':         { type: 'suggestion', description: 'Mixed camelCase and snake_case in the same scope' },
  'no-return-type':               { type: 'suggestion', description: 'Missing explicit return types on functions' },
  'magic-number':                 { type: 'suggestion', description: 'Numeric literals used directly in logic' },
  'over-commented':               { type: 'suggestion', description: 'Functions where comments exceed 40% of lines' },
}

// ts-morph Project singleton — reutilizado para todos los archivos en un lint run
const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: true },
})

// Cache de FileReport por filename para no llamar analyzeFile 26 veces por archivo
const cache = new Map<string, FileReport>()

function getFileReport(filename: string): FileReport {
  if (cache.has(filename)) return cache.get(filename)!

  // Obtener o agregar el SourceFile al Project
  let sourceFile = project.getSourceFile(filename)
  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(filename)
  }

  const report = analyzeFile(sourceFile)
  cache.set(filename, report)

  // Evitar memory leak en watch mode — mantener máximo 100 entradas
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }

  return report
}

// Crea una regla ESLint para una regla drift específica
function createRule(ruleName: string): Rule.RuleModule {
  const doc = RULE_DOCS[ruleName] ?? { type: 'suggestion' as RuleType, description: ruleName }

  return {
    meta: {
      type: doc.type,
      docs: {
        description: doc.description,
        url: `https://github.com/eduardbar/drift#${ruleName}`,
      },
      schema: [],
      messages: {
        issue: '{{ message }}',
      },
    },
    create(context) {
      return {
        'Program:exit'() {
          const filename = context.filename
          if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) return
          if (filename.includes('node_modules')) return

          try {
            const fileReport = getFileReport(filename)
            for (const issue of fileReport.issues) {
              if (issue.rule !== ruleName) continue
              const col = issue.column > 0 ? issue.column - 1 : 0
              context.report({
                loc: {
                  start: { line: issue.line, column: col },
                  end:   { line: issue.line, column: col + 1 },
                },
                messageId: 'issue',
                data: { message: issue.message },
              })
            }
          } catch {
            // Archivo no parseable por ts-morph — silenciar
          }
        },
      }
    },
  }
}

// Objeto con todas las reglas
const rules: Record<string, Rule.RuleModule> = Object.fromEntries(
  Object.keys(RULE_DOCS).map(name => [name, createRule(name)])
)

// Plugin object
const plugin = {
  meta: {
    name: 'eslint-plugin-drift',
    version: '0.1.0',
  },
  rules,
  configs: {} as Record<string, unknown>,
}

// Config recommended — todas las reglas en su severidad canónica de drift
Object.assign(plugin.configs, {
  recommended: [
    {
      plugins: { drift: plugin },
      rules: {
        // errors
        'drift/large-file':              'error',
        'drift/large-function':          'error',
        'drift/duplicate-function-name': 'error',
        'drift/high-complexity':         'error',
        'drift/circular-dependency':     'error',
        'drift/layer-violation':         'error',
        // warnings
        'drift/debug-leftover':              'warn',
        'drift/dead-code':                   'warn',
        'drift/any-abuse':                   'warn',
        'drift/catch-swallow':               'warn',
        'drift/comment-contradiction':       'warn',
        'drift/deep-nesting':                'warn',
        'drift/too-many-params':             'warn',
        'drift/high-coupling':               'warn',
        'drift/promise-style-mix':           'warn',
        'drift/unused-export':               'warn',
        'drift/dead-file':                   'warn',
        'drift/unused-dependency':           'warn',
        'drift/cross-boundary-import':       'warn',
        'drift/hardcoded-config':            'warn',
        'drift/inconsistent-error-handling': 'warn',
        'drift/unnecessary-abstraction':     'warn',
        'drift/naming-inconsistency':        'warn',
        // info → ESLint no tiene "info", mapeamos a "warn"
        'drift/no-return-type':   'warn',
        'drift/magic-number':     'warn',
        'drift/over-commented':   'warn',
      },
    },
  ],
})

export default plugin
