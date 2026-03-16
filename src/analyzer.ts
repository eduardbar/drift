// drift-ignore-file
import * as path from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { Project } from 'ts-morph'
import type {
  DriftIssue,
  FileReport,
  DriftConfig,
  DriftAnalysisOptions,
  DriftPerformanceConfig,
  LoadedPlugin,
  PluginRuleContext,
  PluginLoadError,
  PluginLoadWarning,
} from './types.js'

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
  'analysis-skip-max-files':       { severity: 'info',    weight: 0  },
  'analysis-skip-file-size':       { severity: 'info',    weight: 0  },
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

interface AnalyzableSource {
  path: string
  sizeBytes: number
}

interface ResolvedAnalysisOptions {
  lowMemory: boolean
  chunkSize: number
  maxFiles?: number
  maxFileSizeKb?: number
  includeSemanticDuplication: boolean
}

interface SourceSelection {
  selectedPaths: string[]
  skippedReports: FileReport[]
}

function collectAnalyzableSources(targetPath: string): AnalyzableSource[] {
  const sourcePaths: AnalyzableSource[] = []
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

      let sizeBytes = 0
      try {
        sizeBytes = statSync(entryPath).size
      } catch {
        sizeBytes = 0
      }

      sourcePaths.push({ path: entryPath, sizeBytes })
    }
  }

  sourcePaths.sort((a, b) => a.path.localeCompare(b.path))
  return sourcePaths
}

function resolveAnalysisOptions(config?: DriftConfig, options?: DriftAnalysisOptions): ResolvedAnalysisOptions {
  const performance: DriftPerformanceConfig | undefined = config?.performance
  const lowMemory = options?.lowMemory ?? performance?.lowMemory ?? false
  const chunkSize = Math.max(1, options?.chunkSize ?? performance?.chunkSize ?? (lowMemory ? 40 : 200))
  const includeSemanticDuplication = options?.includeSemanticDuplication
    ?? performance?.includeSemanticDuplication
    ?? !lowMemory

  return {
    lowMemory,
    chunkSize,
    maxFiles: options?.maxFiles ?? performance?.maxFiles,
    maxFileSizeKb: options?.maxFileSizeKb ?? performance?.maxFileSizeKb,
    includeSemanticDuplication,
  }
}

function chunkPaths(paths: string[], chunkSize: number): string[][] {
  if (paths.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += chunkSize) {
    chunks.push(paths.slice(i, i + chunkSize))
  }
  return chunks
}

function toPathKey(filePath: string): string {
  let normalized = path.normalize(filePath)
  if (process.platform === 'win32' && /^\\[A-Za-z]:\\/.test(normalized)) {
    normalized = normalized.slice(1)
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function createAnalysisSkipReport(filePath: string, rule: 'analysis-skip-max-files' | 'analysis-skip-file-size', message: string): FileReport {
  const issue: DriftIssue = {
    rule,
    severity: RULE_WEIGHTS[rule].severity,
    message,
    line: 1,
    column: 1,
    snippet: path.basename(filePath),
  }
  return {
    path: filePath,
    issues: [issue],
    score: calculateScore([issue], RULE_WEIGHTS),
  }
}

function selectSourcesForAnalysis(sources: AnalyzableSource[], options: ResolvedAnalysisOptions): SourceSelection {
  let selected = sources
  const skippedReports: FileReport[] = []

  if (typeof options.maxFiles === 'number' && options.maxFiles >= 0 && selected.length > options.maxFiles) {
    const allowed = selected.slice(0, options.maxFiles)
    const skipped = selected.slice(options.maxFiles)
    selected = allowed

    for (const source of skipped) {
      skippedReports.push(createAnalysisSkipReport(
        source.path,
        'analysis-skip-max-files',
        `Skipped by maxFiles guardrail (${options.maxFiles})`,
      ))
    }
  }

  if (typeof options.maxFileSizeKb === 'number' && options.maxFileSizeKb > 0) {
    const maxBytes = options.maxFileSizeKb * 1024
    const keep: AnalyzableSource[] = []
    for (const source of selected) {
      if (source.sizeBytes > maxBytes) {
        const fileSizeKb = Math.ceil(source.sizeBytes / 1024)
        skippedReports.push(createAnalysisSkipReport(
          source.path,
          'analysis-skip-file-size',
          `Skipped by maxFileSizeKb guardrail (${fileSizeKb}KB > ${options.maxFileSizeKb}KB)`,
        ))
      } else {
        keep.push(source)
      }
    }
    selected = keep
  }

  return {
    selectedPaths: selected.map((source) => source.path),
    skippedReports,
  }
}

function resolveImportTargetPath(
  importerPath: string,
  moduleSpecifier: string,
  sourcePathMap: Map<string, string>,
): string | undefined {
  if (!moduleSpecifier.startsWith('.') && !path.isAbsolute(moduleSpecifier)) {
    return undefined
  }

  const normalizedSpecifier = moduleSpecifier.replace(/\\/g, '/')
  const basePath = path.resolve(path.dirname(importerPath), normalizedSpecifier)
  const ext = path.extname(basePath)
  const candidates = new Set<string>()

  const addCandidate = (candidate: string) => {
    candidates.add(path.normalize(candidate))
  }

  if (ext.length > 0) {
    addCandidate(basePath)
    if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      const withoutExt = basePath.slice(0, -ext.length)
      addCandidate(`${withoutExt}.ts`)
      addCandidate(`${withoutExt}.tsx`)
      addCandidate(`${withoutExt}.js`)
      addCandidate(`${withoutExt}.jsx`)
    }
  } else {
    addCandidate(basePath)
    addCandidate(`${basePath}.ts`)
    addCandidate(`${basePath}.tsx`)
    addCandidate(`${basePath}.js`)
    addCandidate(`${basePath}.jsx`)
    addCandidate(path.join(basePath, 'index.ts'))
    addCandidate(path.join(basePath, 'index.tsx'))
    addCandidate(path.join(basePath, 'index.js'))
    addCandidate(path.join(basePath, 'index.jsx'))
  }

  for (const candidate of candidates) {
    const resolved = sourcePathMap.get(toPathKey(candidate))
    if (resolved) return resolved
  }

  return undefined
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

export function analyzeProject(targetPath: string, config?: DriftConfig, options?: DriftAnalysisOptions): FileReport[] {
  const analysisOptions = resolveAnalysisOptions(config, options)
  const discoveredSources = collectAnalyzableSources(targetPath)
  const { selectedPaths: sourcePaths, skippedReports } = selectSourcesForAnalysis(discoveredSources, analysisOptions)
  const sourcePathMap = new Map<string, string>(sourcePaths.map((filePath) => [toPathKey(filePath), filePath]))
  const pluginRuntime = loadPlugins(targetPath, config?.plugins)

  const reports: FileReport[] = [...skippedReports]
  const reportByPath = new Map<string, FileReport>()
  const ignoredPaths = new Set<string>()
  const allImportedPathKeys = new Set<string>()
  const allImportedNamesByKey = new Map<string, Set<string>>()
  const allLiteralImports = new Set<string>()
  const importGraph = new Map<string, Set<string>>()
  const fingerprintMap = new Map<string, Array<{ filePath: string; name: string; line: number; col: number }>>()

  const getReport = (filePath: string): FileReport | undefined => {
    const fileKey = toPathKey(filePath)
    if (ignoredPaths.has(fileKey)) return undefined
    return reportByPath.get(fileKey)
  }

  const addImportedName = (resolvedPath: string, name: string) => {
    const resolvedKey = toPathKey(resolvedPath)
    if (!allImportedNamesByKey.has(resolvedKey)) {
      allImportedNamesByKey.set(resolvedKey, new Set())
    }
    allImportedNamesByKey.get(resolvedKey)!.add(name)
  }

  const collectCrossFileMetadata = (sourceFile: import('ts-morph').SourceFile) => {
    const sourceFilePath = sourceFile.getFilePath()
    const sourceFileKey = toPathKey(sourceFilePath)
    const sourceFilePathCanonical = sourcePathMap.get(sourceFileKey) ?? sourceFilePath

    for (const decl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = decl.getModuleSpecifierValue()
      allLiteralImports.add(moduleSpecifier)

      const resolvedPath = analysisOptions.lowMemory
        ? resolveImportTargetPath(sourceFilePath, moduleSpecifier, sourcePathMap)
        : decl.getModuleSpecifierSourceFile()?.getFilePath()

      if (!resolvedPath) continue
      const resolvedPathKey = toPathKey(resolvedPath)
      const resolvedPathCanonical = sourcePathMap.get(resolvedPathKey) ?? resolvedPath
      allImportedPathKeys.add(resolvedPathKey)

      if (!importGraph.has(sourceFilePathCanonical)) importGraph.set(sourceFilePathCanonical, new Set())
      importGraph.get(sourceFilePathCanonical)!.add(resolvedPathCanonical)

      for (const named of decl.getNamedImports().map((namedImport) => namedImport.getName())) {
        addImportedName(resolvedPathCanonical, named)
      }
      if (decl.getDefaultImport()) addImportedName(resolvedPathCanonical, 'default')
      if (decl.getNamespaceImport()) addImportedName(resolvedPathCanonical, '*')
    }

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue()
      if (!moduleSpecifier) continue

      const reExportedPath = analysisOptions.lowMemory
        ? resolveImportTargetPath(sourceFilePath, moduleSpecifier, sourcePathMap)
        : exportDecl.getModuleSpecifierSourceFile()?.getFilePath()

      if (!reExportedPath) continue
      const reExportedPathKey = toPathKey(reExportedPath)
      const reExportedPathCanonical = sourcePathMap.get(reExportedPathKey) ?? reExportedPath
      allImportedPathKeys.add(reExportedPathKey)

      const namedExports = exportDecl.getNamedExports()
      if (namedExports.length === 0) {
        addImportedName(reExportedPathCanonical, '*')
      } else {
        for (const namedExport of namedExports) {
          addImportedName(reExportedPathCanonical, namedExport.getName())
        }
      }
    }

    if (!analysisOptions.includeSemanticDuplication || ignoredPaths.has(sourceFileKey)) {
      return
    }

    for (const { fn, name, line, col } of collectFunctions(sourceFile)) {
      const fp = fingerprintFunction(fn)
      if (!fingerprintMap.has(fp)) fingerprintMap.set(fp, [])
      fingerprintMap.get(fp)!.push({ filePath: sourceFilePathCanonical, name, line, col })
    }
  }

  const analyzeChunk = (chunk: string[]) => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 1 },
    })
    project.addSourceFilesAtPaths(chunk)

    for (const sourceFile of project.getSourceFiles()) {
      const sourceFilePath = sourceFile.getFilePath()
      const sourceFileKey = toPathKey(sourceFilePath)
      const sourceFilePathCanonical = sourcePathMap.get(sourceFileKey) ?? sourceFilePath
      const report = analyzeFile(sourceFile, {
        config,
        loadedPlugins: pluginRuntime.plugins,
        projectRoot: targetPath,
      })
      report.path = sourceFilePathCanonical

      reports.push(report)
      reportByPath.set(sourceFileKey, report)
      if (isFileIgnored(sourceFile)) ignoredPaths.add(sourceFileKey)
      collectCrossFileMetadata(sourceFile)
    }
  }

  const chunks = chunkPaths(sourcePaths, analysisOptions.lowMemory ? analysisOptions.chunkSize : sourcePaths.length || 1)
  for (const chunk of chunks) {
    analyzeChunk(chunk)
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

  for (const chunk of chunks) {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 1 },
    })
    project.addSourceFilesAtPaths(chunk)
    const sourceFiles = project.getSourceFiles()

    const importedPathsForChunk = new Set<string>()
    const importedNamesForChunk = new Map<string, Set<string>>()
    for (const sourceFile of sourceFiles) {
      const sfPath = sourceFile.getFilePath()
      const sfKey = toPathKey(sfPath)
      if (allImportedPathKeys.has(sfKey)) importedPathsForChunk.add(sfPath)
      const importedNames = allImportedNamesByKey.get(sfKey)
      if (importedNames) importedNamesForChunk.set(sfPath, new Set(importedNames))
    }

    const deadFiles = detectDeadFiles(sourceFiles, importedPathsForChunk, RULE_WEIGHTS)
    for (const [sfPath, issue] of deadFiles) {
      const report = getReport(sfPath)
      if (report) report.issues.push(issue)
    }

    const unusedExports = detectUnusedExports(sourceFiles, importedNamesForChunk, RULE_WEIGHTS)
    for (const [sfPath, issues] of unusedExports) {
      const report = getReport(sfPath)
      if (!report) continue
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

  const circularIssues = detectCircularDependencies(importGraph, RULE_WEIGHTS)
  for (const [filePath, issue] of circularIssues) {
    const report = getReport(filePath)
    if (report) report.issues.push(issue)
  }

  if (config?.layers && config.layers.length > 0) {
    const layerIssues = detectLayerViolations(importGraph, config.layers, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of layerIssues) {
      const report = getReport(filePath)
      if (!report) continue
      for (const issue of issues) {
        report.issues.push(issue)
      }
    }
  }

  if (config?.modules && config.modules.length > 0) {
    const boundaryIssues = detectCrossBoundaryImports(importGraph, config.modules, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of boundaryIssues) {
      const report = getReport(filePath)
      if (!report) continue
      for (const issue of issues) {
        report.issues.push(issue)
      }
    }
  }

  if (analysisOptions.includeSemanticDuplication) {
    const relativePathCache = new Map<string, string>()
    const toRelativePath = (filePath: string): string => {
      const cached = relativePathCache.get(filePath)
      if (cached) return cached
      const value = path.relative(targetPath, filePath).replace(/\\/g, '/')
      relativePathCache.set(filePath, value)
      return value
    }

    for (const [, entries] of fingerprintMap) {
      if (entries.length < 2) continue

      for (const entry of entries) {
        const report = getReport(entry.filePath)
        if (!report) continue

        const others = entries
          .filter((other) => other !== entry)
          .map((other) => `${toRelativePath(other.filePath)}:${other.line} (${other.name})`)
          .join(', ')

        report.issues.push({
          rule: 'semantic-duplication',
          severity: 'warning',
          message: `Function '${entry.name}' is semantically identical to: ${others}`,
          line: entry.line,
          column: entry.col,
          snippet: `function ${entry.name} - duplicated in ${entries.length - 1} other location${entries.length > 2 ? 's' : ''}`,
        })
      }
    }
  }

  for (const report of reportByPath.values()) {
    report.score = calculateScore(report.issues, RULE_WEIGHTS)
  }

  return reports
}
