// drift-ignore-file
import * as path from 'node:path'
import { Project } from 'ts-morph'
import type { DriftIssue, FileReport, DriftConfig } from './types.js'

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

  // Build set of ignored paths so cross-file phases don't re-add issues
  const ignoredPaths = new Set<string>(
    sourceFiles.filter(sf => isFileIgnored(sf)).map(sf => sf.getFilePath())
  )

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
  const deadFiles = detectDeadFiles(sourceFiles, allImportedPaths, RULE_WEIGHTS)
  for (const [sfPath, issue] of deadFiles) {
    if (ignoredPaths.has(sfPath)) continue
    const report = reportByPath.get(sfPath)
    if (report) {
      report.issues.push(issue)
      report.score = calculateScore(report.issues, RULE_WEIGHTS)
    }
  }

  const unusedExports = detectUnusedExports(sourceFiles, allImportedNames, RULE_WEIGHTS)
  for (const [sfPath, issues] of unusedExports) {
    if (ignoredPaths.has(sfPath)) continue
    const report = reportByPath.get(sfPath)
    if (report) {
      for (const issue of issues) {
        report.issues.push(issue)
      }
      report.score = calculateScore(report.issues, RULE_WEIGHTS)
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
    if (ignoredPaths.has(filePath)) continue
    const report = reportByPath.get(filePath)
    if (report) {
      report.issues.push(issue)
      report.score = calculateScore(report.issues, RULE_WEIGHTS)
    }
  }

  // ── Phase 3b: layer-violation ────────────────────────────────────────────────
  if (config?.layers && config.layers.length > 0) {
    const layerIssues = detectLayerViolations(importGraph, config.layers, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of layerIssues) {
      if (ignoredPaths.has(filePath)) continue
      const report = reportByPath.get(filePath)
      if (report) {
        for (const issue of issues) {
          report.issues.push(issue)
          report.score = Math.min(100, report.score + (RULE_WEIGHTS['layer-violation']?.weight ?? 5))
        }
      }
    }
  }

  // ── Phase 3c: cross-boundary-import ─────────────────────────────────────────
  if (config?.modules && config.modules.length > 0) {
    const boundaryIssues = detectCrossBoundaryImports(importGraph, config.modules, targetPath, RULE_WEIGHTS)
    for (const [filePath, issues] of boundaryIssues) {
      if (ignoredPaths.has(filePath)) continue
      const report = reportByPath.get(filePath)
      if (report) {
        for (const issue of issues) {
          report.issues.push(issue)
          report.score = Math.min(100, report.score + (RULE_WEIGHTS['cross-boundary-import']?.weight ?? 5))
        }
      }
    }
  }

  // ── Phase 8: semantic-duplication ───────────────────────────────────────────
  const fingerprintMap = new Map<string, Array<{ filePath: string; name: string; line: number; col: number }>>()

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
