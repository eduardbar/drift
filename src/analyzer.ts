// drift-ignore-file
import * as path from 'node:path'
import { readdirSync } from 'node:fs'
import { Project } from 'ts-morph'
import type { DriftIssue, FileReport, DriftConfig, LoadedPlugin, PluginRuleContext, PluginLoadError, PluginLoadWarning } from './types.js'

// Rules
import { isFileIgnored } from './rules/shared.js'
import {
  detectLargeFile,
  detectLargeFunctions,
  detectDebugLeftovers,
  detectDeadCode,
  detectDuplicateFunctionNames,
  detectAnyAbuse,
  detectCatchSwallow,
  detectMissingReturnTypes,
} from './rules/phase0-basic.js'
import { detectHighComplexity } from './rules/complexity.js'
import { detectDeepNesting, detectTooManyParams } from './rules/nesting.js'
import { detectHighCoupling } from './rules/coupling.js'
import { detectPromiseStyleMix } from './rules/promise.js'
import { detectMagicNumbers } from './rules/magic.js'
import { detectCommentContradiction } from './rules/comments.js'
import {
  detectDeadFiles,
  detectUnusedExports,
  detectUnusedDependencies,
} from './rules/phase2-crossfile.js'
import {
  detectCircularDependencies,
  detectLayerViolations,
  detectCrossBoundaryImports,
} from './rules/phase3-arch.js'
import {
  detectControllerNoDb,
  detectServiceNoHttp,
  detectMaxFunctionLines,
} from './rules/phase3-configurable.js'
import {
  detectOverCommented,
  detectHardcodedConfig,
  detectInconsistentErrorHandling,
  detectUnnecessaryAbstraction,
  detectNamingInconsistency,
} from './rules/phase5-ai.js'
import {
  collectFunctions,
  fingerprintFunction,
  calculateScore,
} from './rules/phase8-semantic.js'
import { loadPlugins } from './plugins.js'

// Git analyzers (re-exported as part of the public API)
export { TrendAnalyzer } from './git/trend.js'
export { BlameAnalyzer } from './git/blame.js'

// ---------------------------------------------------------------------------
// Rule weights — single source of truth for severities and drift score weights
// ---------------------------------------------------------------------------

export const RULE_WEIGHTS: Record<string, { severity: DriftIssue['severity']; weight: number }> = {
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
  'controller-no-db':         { severity: 'warning', weight: 11 },
  'service-no-http':          { severity: 'warning', weight: 11 },
  'max-function-lines':       { severity: 'warning', weight: 9 },
  // Phase 5: AI authorship heuristics
  'over-commented':                { severity: 'info',    weight: 4  },
  'hardcoded-config':              { severity: 'warning', weight: 10 },
  'inconsistent-error-handling':   { severity: 'warning', weight: 8  },
  'unnecessary-abstraction':       { severity: 'warning', weight: 7  },
  'naming-inconsistency':          { severity: 'warning', weight: 6  },
  'ai-code-smell':                 { severity: 'warning', weight: 12 },
  // Phase 8: semantic duplication
  'semantic-duplication':          { severity: 'warning', weight: 12 },
  'plugin-error':                  { severity: 'warning', weight: 4  },
  'plugin-warning':                { severity: 'info',    weight: 0  },
}

const AI_SMELL_SIGNALS = new Set([
  'over-commented',
  'hardcoded-config',
  'inconsistent-error-handling',
  'unnecessary-abstraction',
  'naming-inconsistency',
  'comment-contradiction',
  'promise-style-mix',
  'any-abuse',
])

function detectAICodeSmell(issues: DriftIssue[], filePath: string): DriftIssue[] {
  const signalCounts = new Map<string, number>()
  for (const issue of issues) {
    if (!AI_SMELL_SIGNALS.has(issue.rule)) continue
    signalCounts.set(issue.rule, (signalCounts.get(issue.rule) ?? 0) + 1)
  }

  const totalSignals = [...signalCounts.values()].reduce((sum, count) => sum + count, 0)
  if (totalSignals < 3) return []

  const triggers = [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rule, count]) => `${rule} x${count}`)

  return [{
    rule: 'ai-code-smell',
    severity: 'warning',
    message: `Aggregated AI smell signals detected (${totalSignals}): ${triggers.join(', ')}`,
    line: 1,
    column: 1,
    snippet: path.basename(filePath),
  }]
}

function runPluginRules(
  file: import('ts-morph').SourceFile,
  loadedPlugins: LoadedPlugin[],
  config: DriftConfig | undefined,
  projectRoot: string,
): DriftIssue[] {
  if (loadedPlugins.length === 0) return []
  const context: PluginRuleContext = {
    projectRoot,
    filePath: file.getFilePath(),
    config,
  }

  const issues: DriftIssue[] = []
  for (const loaded of loadedPlugins) {
    for (const rule of loaded.plugin.rules) {
      try {
        const detected = rule.detect(file, context)
        if (detected == null) continue
        if (!Array.isArray(detected)) {
          throw new Error(`detect() must return DriftIssue[], got ${typeof detected}`)
        }

        for (const [issueIndex, issue] of detected.entries()) {
          if (!issue || typeof issue !== 'object') {
            issues.push({
              rule: 'plugin-error',
              severity: 'warning',
              message: `Plugin '${loaded.plugin.name}' rule '${rule.name}' returned a non-object issue at index ${issueIndex}`,
              line: 1,
              column: 1,
              snippet: file.getBaseName(),
            })
            continue
          }

          const line = typeof issue.line === 'number' ? issue.line : 1
          const column = typeof issue.column === 'number' ? issue.column : 1
          const message = typeof issue.message === 'string'
            ? issue.message
            : `Invalid plugin issue at index ${issueIndex}: missing string 'message'`
          const snippet = typeof issue.snippet === 'string' ? issue.snippet : file.getBaseName()
          const severity = issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'info'
            ? issue.severity
            : (rule.severity ?? 'warning')

          issues.push({
            ...issue,
            rule: issue.rule || `${loaded.plugin.name}/${rule.name}`,
            severity,
            line,
            column,
            message,
            snippet,
          })
        }
      } catch (error) {
        issues.push({
          rule: 'plugin-error',
          severity: 'warning',
          message: `Plugin '${loaded.id}' rule '${rule.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
          line: 1,
          column: 1,
          snippet: file.getBaseName(),
        })
      }
    }
  }
  return issues
}

function normalizeDiagnosticFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function pluginDiagnosticToIssue(
  targetPath: string,
  diagnostic: PluginLoadError | PluginLoadWarning,
  kind: 'error' | 'warning',
): FileReport {
  const prefix = kind === 'error' ? 'Failed to load plugin' : 'Plugin validation warning'
  const ruleLabel = diagnostic.ruleId ? ` rule '${diagnostic.ruleId}'` : ''
  const pluginLabel = diagnostic.pluginName
    ? `'${diagnostic.pluginId}' (${diagnostic.pluginName})`
    : `'${diagnostic.pluginId}'`

  const issue: DriftIssue = {
    rule: kind === 'error' ? 'plugin-error' : 'plugin-warning',
    severity: kind === 'error' ? 'warning' : 'info',
    message: `${prefix} ${pluginLabel}${ruleLabel}: ${diagnostic.message}`,
    line: 1,
    column: 1,
    snippet: diagnostic.pluginId,
  }

  const safePluginId = normalizeDiagnosticFilePart(diagnostic.pluginId)
  const safeRuleId = diagnostic.ruleId ? `.${normalizeDiagnosticFilePart(diagnostic.ruleId)}` : ''
  const kindDir = kind === 'error' ? '.drift-plugin-errors' : '.drift-plugin-warnings'

  return {
    path: path.join(targetPath, kindDir, `${safePluginId}${safeRuleId}.plugin`),
    issues: [issue],
    score: calculateScore([issue], RULE_WEIGHTS),
  }
}

const ANALYZABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const EXCLUDED_DIR_NAMES = new Set(['node_modules', 'dist', '.next', 'build'])

function shouldAnalyzeFile(fileName: string): boolean {
  if (fileName.endsWith('.d.ts')) return false
  if (/\.test\.[^.]+$/.test(fileName)) return false
  if (/\.spec\.[^.]+$/.test(fileName)) return false
  return ANALYZABLE_EXTENSIONS.has(path.extname(fileName))
}

function collectAnalyzableSourcePaths(targetPath: string): string[] {
  const sourcePaths: string[] = []
  const queue: string[] = [targetPath]

  while (queue.length > 0) {
    const currentDir = queue.pop()
    if (!currentDir) continue

    let entries: Array<import('node:fs').Dirent<string>>
    try {
      entries = readdirSync(currentDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
        queue.push(entryPath)
        continue
      }

      if (!entry.isFile()) continue
      if (!shouldAnalyzeFile(entry.name)) continue
      sourcePaths.push(entryPath)
    }
  }

  sourcePaths.sort()
  return sourcePaths
}

// ---------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------

export function analyzeFile(
  file: import('ts-morph').SourceFile,
  options?: DriftConfig | {
    config?: DriftConfig
    loadedPlugins?: LoadedPlugin[]
    projectRoot?: string
  },
): FileReport {
  const normalizedOptions = (options && typeof options === 'object' && ('config' in options || 'loadedPlugins' in options || 'projectRoot' in options))
    ? options
    : { config: (options && typeof options === 'object' ? options : undefined) as DriftConfig | undefined }

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
    ...detectMagicNumbers(file),
    ...detectCommentContradiction(file),
    // Phase 5: AI authorship heuristics
    ...detectOverCommented(file),
    ...detectHardcodedConfig(file),
    ...detectInconsistentErrorHandling(file),
    ...detectUnnecessaryAbstraction(file),
    ...detectNamingInconsistency(file),
    // Configurable architecture rules
    ...detectControllerNoDb(file, normalizedOptions?.config),
    ...detectServiceNoHttp(file, normalizedOptions?.config),
    ...detectMaxFunctionLines(file, normalizedOptions?.config),
    // Plugin rules
    ...runPluginRules(
      file,
      normalizedOptions?.loadedPlugins ?? [],
      normalizedOptions?.config,
      normalizedOptions?.projectRoot ?? path.dirname(file.getFilePath()),
    ),
  ]

  issues.push(...detectAICodeSmell(issues, file.getFilePath()))

  return {
    path: file.getFilePath(),
    issues,
    score: calculateScore(issues, RULE_WEIGHTS),
  }
}

// ---------------------------------------------------------------------------
// Project-level analysis (phases 2, 3, 8 require the full file set)
// ---------------------------------------------------------------------------

export function analyzeProject(targetPath: string, config?: DriftConfig): FileReport[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 1 },  // 1 = JsxEmit.Preserve
  })

  const sourcePaths = collectAnalyzableSourcePaths(targetPath)
  if (sourcePaths.length > 0) {
    project.addSourceFilesAtPaths(sourcePaths)
  }

  const sourceFiles = project.getSourceFiles()
  const pluginRuntime = loadPlugins(targetPath, config?.plugins)

  // Phase 1: per-file analysis
  const reports: FileReport[] = []
  const reportByPath = new Map<string, FileReport>()
  const ignoredPaths = new Set<string>()

  for (const file of sourceFiles) {
    const filePath = file.getFilePath()
    const report = analyzeFile(file, {
      config,
      loadedPlugins: pluginRuntime.plugins,
      projectRoot: targetPath,
    })

    reports.push(report)
    reportByPath.set(report.path, report)
    if (isFileIgnored(file)) ignoredPaths.add(filePath)
  }

  const getReport = (filePath: string): FileReport | undefined => {
    if (ignoredPaths.has(filePath)) return undefined
    return reportByPath.get(filePath)
  }

  // ── Phase 2 setup: build import graph ──────────────────────────────────────
  const allImportedPaths = new Set<string>()
  const allImportedNames = new Map<string, Set<string>>()
  const allLiteralImports = new Set<string>()
  const importGraph = new Map<string, Set<string>>()

  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    for (const decl of sf.getImportDeclarations()) {
      const moduleSpecifier = decl.getModuleSpecifierValue()
      allLiteralImports.add(moduleSpecifier)

      const resolved = decl.getModuleSpecifierSourceFile()
      if (resolved) {
        const resolvedPath = resolved.getFilePath()
        allImportedPaths.add(resolvedPath)

        if (!importGraph.has(sfPath)) importGraph.set(sfPath, new Set())
        importGraph.get(sfPath)!.add(resolvedPath)

        const named = decl.getNamedImports().map(n => n.getName())
        const def = decl.getDefaultImport()?.getText()
        const ns = decl.getNamespaceImport()?.getText()

        if (!allImportedNames.has(resolvedPath)) {
          allImportedNames.set(resolvedPath, new Set())
        }
        const nameSet = allImportedNames.get(resolvedPath)!
        for (const n of named) nameSet.add(n)
        if (def) nameSet.add('default')
        if (ns) nameSet.add('*')
      }
    }

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
        nameSet.add('*')
      } else {
        for (const ne of namedExports) nameSet.add(ne.getName())
      }
    }
  }

  // Plugin diagnostics are surfaced as synthetic report entries.
  if (pluginRuntime.errors.length > 0) {
    for (const err of pluginRuntime.errors) {
      reports.push(pluginDiagnosticToIssue(targetPath, err, 'error'))
    }
  }

  if (pluginRuntime.warnings.length > 0) {
    for (const warning of pluginRuntime.warnings) {
      reports.push(pluginDiagnosticToIssue(targetPath, warning, 'warning'))
    }
  }

  // ── Phase 2: dead-file + unused-export + unused-dependency ─────────────────
  const deadFiles = detectDeadFiles(sourceFiles, allImportedPaths, RULE_WEIGHTS)
  for (const [sfPath, issue] of deadFiles) {
    const report = getReport(sfPath)
    if (report) {
      report.issues.push(issue)
    }
  }

  const unusedExports = detectUnusedExports(sourceFiles, allImportedNames, RULE_WEIGHTS)
  for (const [sfPath, issues] of unusedExports) {
    const report = getReport(sfPath)
    if (report) {
      for (const issue of issues) {
        report.issues.push(issue)
      }
    }
  }

  const unusedDepIssues = detectUnusedDependencies(targetPath, allLiteralImports, RULE_WEIGHTS)
  if (unusedDepIssues.length > 0) {
    const pkgPath = path.join(targetPath, 'package.json')
    reports.push({
      path: pkgPath,
      issues: unusedDepIssues,
      score: calculateScore(unusedDepIssues, RULE_WEIGHTS),
    })
  }

  // ── Phase 3: circular-dependency ────────────────────────────────────────────
  const circularIssues = detectCircularDependencies(importGraph, RULE_WEIGHTS)
  for (const [filePath, issue] of circularIssues) {
    const report = getReport(filePath)
    if (report) {
      report.issues.push(issue)
    }
  }

  // ── Phase 3b: layer-violation ────────────────────────────────────────────────
  if (config?.layers && config.layers.length > 0) {
    const layerIssues = detectLayerViolations(importGraph, config.layers, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of layerIssues) {
      const report = getReport(filePath)
      if (report) {
        for (const issue of issues) {
          report.issues.push(issue)
        }
      }
    }
  }

  // ── Phase 3c: cross-boundary-import ─────────────────────────────────────────
  if (config?.modules && config.modules.length > 0) {
    const boundaryIssues = detectCrossBoundaryImports(importGraph, config.modules, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of boundaryIssues) {
      const report = getReport(filePath)
      if (report) {
        for (const issue of issues) {
          report.issues.push(issue)
        }
      }
    }
  }

  // ── Phase 8: semantic-duplication ───────────────────────────────────────────
  const fingerprintMap = new Map<string, Array<{ filePath: string; name: string; line: number; col: number }>>()
  const relativePathCache = new Map<string, string>()

  const toRelativePath = (filePath: string): string => {
    const cached = relativePathCache.get(filePath)
    if (cached) return cached
    const value = path.relative(targetPath, filePath).replace(/\\/g, '/')
    relativePathCache.set(filePath, value)
    return value
  }

  for (const sf of sourceFiles) {
    if (isFileIgnored(sf)) continue
    const sfPath = sf.getFilePath()
    for (const { fn, name, line, col } of collectFunctions(sf)) {
      const fp = fingerprintFunction(fn)
      if (!fingerprintMap.has(fp)) fingerprintMap.set(fp, [])
      fingerprintMap.get(fp)!.push({ filePath: sfPath, name, line, col })
    }
  }

  for (const [, entries] of fingerprintMap) {
    if (entries.length < 2) continue

    for (const entry of entries) {
      const report = reportByPath.get(entry.filePath)
      if (!report) continue

      const others = entries
        .filter(e => e !== entry)
        .map(e => `${toRelativePath(e.filePath)}:${e.line} (${e.name})`)
        .join(', ')

      report.issues.push({
        rule: 'semantic-duplication',
        severity: 'warning',
        message: `Function '${entry.name}' is semantically identical to: ${others}`,
        line: entry.line,
        column: entry.col,
        snippet: `function ${entry.name} — duplicated in ${entries.length - 1} other location${entries.length > 2 ? 's' : ''}`,
      })
    }
  }

  for (const report of reportByPath.values()) {
    report.score = calculateScore(report.issues, RULE_WEIGHTS)
  }

  return reports
}
