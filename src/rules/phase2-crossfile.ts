import * as fs from 'node:fs'
import * as path from 'node:path'
import { SourceFile } from 'ts-morph'
import type { DriftIssue } from '../types.js'

/**
 * Detect files that are never imported by any other file in the project.
 * Entry-point files (index, main, cli, app, bin/) are excluded.
 */
export function detectDeadFiles(
  sourceFiles: SourceFile[],
  allImportedPaths: Set<string>,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): Map<string, DriftIssue> {
  const issues = new Map<string, DriftIssue>()

  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    const basename = path.basename(sfPath)
    const isBinFile = sfPath.replace(/\\/g, '/').includes('/bin/')
    const isEntryPoint = /^(index|main|cli|app)\.(ts|tsx|js|jsx)$/.test(basename) || isBinFile

    if (!isEntryPoint && !allImportedPaths.has(sfPath)) {
      issues.set(sfPath, {
        rule: 'dead-file',
        severity: ruleWeights['dead-file'].severity,
        message: 'File is never imported — may be dead code',
        line: 1,
        column: 1,
        snippet: basename,
      })
    }
  }

  return issues
}

/**
 * Detect named exports that are never imported by any other file.
 * Barrel files (index.*) are excluded since their entire surface is the public API.
 */
export function detectUnusedExports(
  sourceFiles: SourceFile[],
  allImportedNames: Map<string, Set<string>>,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): Map<string, DriftIssue[]> {
  const result = new Map<string, DriftIssue[]>()

  for (const sf of sourceFiles) {
    const sfPath = sf.getFilePath()
    const basename = path.basename(sfPath)
    const isBarrel = /^index\.(ts|tsx|js|jsx)$/.test(basename)
    const importedNamesForFile = allImportedNames.get(sfPath)
    const hasNamespaceImport = importedNamesForFile?.has('*') ?? false

    if (isBarrel || hasNamespaceImport) continue

    const issues: DriftIssue[] = []

    for (const exportDecl of sf.getExportDeclarations()) {
      for (const namedExport of exportDecl.getNamedExports()) {
        const name = namedExport.getName()
        if (!importedNamesForFile?.has(name)) {
          issues.push({
            rule: 'unused-export',
            severity: ruleWeights['unused-export'].severity,
            message: `'${name}' is exported but never imported`,
            line: namedExport.getStartLineNumber(),
            column: 1,
            snippet: namedExport.getText().slice(0, 80),
          })
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

        issues.push({
          rule: 'unused-export',
          severity: ruleWeights['unused-export'].severity,
          message: `'${exportName}' is exported but never imported`,
          line: decl.getStartLineNumber(),
          column: 1,
          snippet: decl.getText().split('\n')[0].slice(0, 80),
        })
        break // one issue per export name is enough
      }
    }

    if (issues.length > 0) {
      result.set(sfPath, issues)
    }
  }

  return result
}

/**
 * Detect packages in package.json that are never imported in any source file.
 * @type-only packages (@types/*) are excluded.
 */
export function detectUnusedDependencies(
  targetPath: string,
  allLiteralImports: Set<string>,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): DriftIssue[] {
  const pkgPath = path.join(targetPath, 'package.json') // drift-ignore
  if (!fs.existsSync(pkgPath)) return []

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
    const isUsed = [...allLiteralImports].some(
      imp => imp === depName || imp.startsWith(depName + '/')
    )
    if (!isUsed) unusedDeps.push(depName)
  }

  return unusedDeps.map(dep => ({
    rule: 'unused-dependency',
    severity: ruleWeights['unused-dependency'].severity,
    message: `'${dep}' is in package.json but never imported`,
    line: 1,
    column: 1,
    snippet: `"${dep}"`,
  }))
}
