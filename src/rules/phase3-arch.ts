// drift-ignore-file

import * as path from 'node:path'
import type { DriftIssue, LayerDefinition, ModuleBoundary } from '../types.js'

/**
 * DFS cycle detection in a directed import graph.
 * Returns arrays of file paths that form cycles.
 */
export function findCycles(graph: Map<string, Set<string>>): Array<string[]> {
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

/**
 * Detect circular dependencies from the import graph.
 * Returns a map of filePath → issue (one per unique cycle).
 */
export function detectCircularDependencies(
  importGraph: Map<string, Set<string>>,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): Map<string, DriftIssue> {
  const cycles = findCycles(importGraph)
  const reportedCycleKeys = new Set<string>()
  const result = new Map<string, DriftIssue>()

  for (const cycle of cycles) {
    const cycleKey = [...cycle].sort().join('|')
    if (reportedCycleKeys.has(cycleKey)) continue
    reportedCycleKeys.add(cycleKey)

    const firstFile = cycle[0]
    if (!firstFile) continue

    const cycleDisplay = cycle
      .map(p => path.basename(p))
      .concat(path.basename(cycle[0])) // close the loop visually: A → B → C → A
      .join(' → ')

    result.set(firstFile, {
      rule: 'circular-dependency',
      severity: ruleWeights['circular-dependency'].severity,
      message: `Circular dependency detected: ${cycleDisplay}`,
      line: 1,
      column: 1,
      snippet: cycleDisplay,
    })
  }

  return result
}

/**
 * Detect layer violations based on user-defined layer configuration.
 * Returns a map of filePath → issues[].
 */
function matchLayer(filePath: string, layers: LayerDefinition[]): LayerDefinition | undefined {
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

export function detectLayerViolations(
  importGraph: Map<string, Set<string>>,
  layers: LayerDefinition[],
  targetPath: string,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): Map<string, DriftIssue[]> {
  const result = new Map<string, DriftIssue[]>()

  for (const [filePath, imports] of importGraph.entries()) {
    const fileLayer = matchLayer(filePath, layers)
    if (!fileLayer) continue

    for (const importedPath of imports) {
      const importedLayer = matchLayer(importedPath, layers)
      if (!importedLayer) continue
      if (importedLayer.name === fileLayer.name) continue

      if (!fileLayer.canImportFrom.includes(importedLayer.name)) {
        if (!result.has(filePath)) result.set(filePath, [])
        result.get(filePath)!.push({
          rule: 'layer-violation',
          severity: 'error',
          message: `Layer '${fileLayer.name}' must not import from layer '${importedLayer.name}'`,
          line: 1,
          column: 1,
          snippet: `import from '${path.relative(targetPath, importedPath).replace(/\\/g, '/')}'`,
        })
      }
    }
  }

  return result
}

/**
 * Detect cross-boundary imports based on user-defined module boundary configuration.
 * Returns a map of filePath → issues[].
 */
function matchModule(filePath: string, modules: ModuleBoundary[]): ModuleBoundary | undefined {
  const rel = filePath.replace(/\\/g, '/')
  return modules.find(m => rel.startsWith(m.root.replace(/\\/g, '/')))
}

function isAllowedImport(importedPath: string, allowedImports: string[]): boolean {
  const relImported = importedPath.replace(/\\/g, '/')
  return allowedImports.some(allowed =>
    relImported.startsWith(allowed.replace(/\\/g, '/'))
  )
}

export function detectCrossBoundaryImports(
  importGraph: Map<string, Set<string>>,
  modules: ModuleBoundary[],
  targetPath: string,
  ruleWeights: Record<string, { severity: DriftIssue['severity']; weight: number }>,
): Map<string, DriftIssue[]> {
  const result = new Map<string, DriftIssue[]>()

  for (const [filePath, imports] of importGraph.entries()) {
    const fileModule = matchModule(filePath, modules)
    if (!fileModule) continue

    for (const importedPath of imports) {
      const importedModule = matchModule(importedPath, modules)
      if (!importedModule) continue
      if (importedModule.name === fileModule.name) continue

      const allowedImports = fileModule.allowedExternalImports ?? []
      if (!isAllowedImport(importedPath, allowedImports)) {
        if (!result.has(filePath)) result.set(filePath, [])
        result.get(filePath)!.push({
          rule: 'cross-boundary-import',
          severity: 'warning',
          message: `Module '${fileModule.name}' must not import from module '${importedModule.name}'`,
          line: 1,
          column: 1,
          snippet: `import from '${path.relative(targetPath, importedPath).replace(/\\/g, '/')}'`,
        })
      }
    }
  }

  return result
}
