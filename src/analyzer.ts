import * as fs from 'node:fs'
import * as path from 'node:path'
import { Project } from 'ts-morph'
import type { DriftIssue, FileReport, DriftConfig, LayerDefinition, ModuleBoundary } from './types.js'

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
import {
  detectHighComplexity,
  detectDeepNesting,
  detectTooManyParams,
  detectHighCoupling,
  detectPromiseStyleMix,
  detectMagicNumbers,
  detectCommentContradiction,
} from './rules/phase1-complexity.js'
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
  // Phase 5: AI authorship heuristics
  'over-commented':                { severity: 'info',    weight: 4  },
  'hardcoded-config':              { severity: 'warning', weight: 10 },
  'inconsistent-error-handling':   { severity: 'warning', weight: 8  },
  'unnecessary-abstraction':       { severity: 'warning', weight: 7  },
  'naming-inconsistency':          { severity: 'warning', weight: 6  },
  // Phase 8: semantic duplication
  'semantic-duplication':          { severity: 'warning', weight: 12 },
}

// ---------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------

export function analyzeFile(file: import('ts-morph').SourceFile): FileReport {
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
  ]

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

  // ── Phase 2: dead-file + unused-export + unused-dependency ─────────────────
  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    const report = reportByPath.get(sfPath)
    if (!report) continue

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
      report.score = calculateScore(report.issues, RULE_WEIGHTS)
    }

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
            report.score = calculateScore(report.issues, RULE_WEIGHTS)
          }
        }
      }

      for (const exportSymbol of sf.getExportedDeclarations()) {
        const [exportName, declarations] = [exportSymbol[0], exportSymbol[1]]
        if (exportName === 'default') continue
        if (importedNamesForFile?.has(exportName)) continue

        for (const decl of declarations) {
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
          report.score = calculateScore(report.issues, RULE_WEIGHTS)
          break
        }
      }
    }
  }

  // unused-dependency
  const pkgPath = path.join(targetPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    } catch {
      pkg = {}
    }

    const deps = { ...((pkg.dependencies as Record<string, string>) ?? {}) }
    const unusedDeps: string[] = []
    for (const depName of Object.keys(deps)) {
      if (depName.startsWith('@types/')) continue
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
        score: calculateScore(pkgIssues, RULE_WEIGHTS),
      })
    }
  }

  // ── Phase 3: circular-dependency ────────────────────────────────────────────
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
          const cycleStart = stack.indexOf(neighbor)
          cycles.push(stack.slice(cycleStart))
        }
      }

      stack.pop()
      inStack.delete(node)
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) dfs(node, [])
    }

    return cycles
  }

  const cycles = findCycles(importGraph)
  const reportedCycleKeys = new Set<string>()

  for (const cycle of cycles) {
    const cycleKey = [...cycle].sort().join('|')
    if (reportedCycleKeys.has(cycleKey)) continue
    reportedCycleKeys.add(cycleKey)

    const firstFile = cycle[0]
    const report = reportByPath.get(firstFile)
    if (!report) continue

    const cycleDisplay = cycle
      .map(p => path.basename(p))
      .concat(path.basename(cycle[0]))
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
    report.score = calculateScore(report.issues, RULE_WEIGHTS)
  }

  // ── Phase 3b: layer-violation ────────────────────────────────────────────────
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

  // ── Phase 3c: cross-boundary-import ─────────────────────────────────────────
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

  // ── Phase 8: semantic-duplication ───────────────────────────────────────────
  const fingerprintMap = new Map<string, Array<{ filePath: string; name: string; line: number; col: number }>>()

  for (const sf of sourceFiles) {
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
        .map(e => {
          const rel = path.relative(targetPath, e.filePath).replace(/\\/g, '/')
          return `${rel}:${e.line} (${e.name})`
        })
        .join(', ')

      const weight = RULE_WEIGHTS['semantic-duplication']?.weight ?? 12
      report.issues.push({
        rule: 'semantic-duplication',
        severity: 'warning',
        message: `Function '${entry.name}' is semantically identical to: ${others}`,
        line: entry.line,
        column: entry.col,
        snippet: `function ${entry.name} — duplicated in ${entries.length - 1} other location${entries.length > 2 ? 's' : ''}`,
      })
      report.score = Math.min(100, report.score + weight)
    }
  }

  return reports
}
