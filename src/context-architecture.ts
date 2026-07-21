import { Project } from 'ts-morph'
import type { ContextArchitectureSummary, DriftConfig } from './types.js'
import { detectCycleEdges } from './map-cycles.js'

function collectImportAdjacency(projectPath: string): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true, jsx: 1 } })
  project.addSourceFilesAtPaths([
    `${projectPath}/**/*.ts`, `${projectPath}/**/*.tsx`, `${projectPath}/**/*.js`, `${projectPath}/**/*.jsx`,
    `!${projectPath}/**/node_modules/**`, `!${projectPath}/**/dist/**`, `!${projectPath}/**/.next/**`,
    `!${projectPath}/**/*.d.ts`,
  ])

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath()
    if (!adjacency.has(filePath)) adjacency.set(filePath, new Set())
    for (const decl of file.getImportDeclarations()) {
      const source = decl.getModuleSpecifierSourceFile()
      if (source) adjacency.get(filePath)!.add(source.getFilePath())
    }
  }
  return adjacency
}

function countCircularDependencies(projectPath: string): number {
  try {
    return detectCycleEdges(collectImportAdjacency(projectPath)).size
  } catch {
    return 0
  }
}

export function buildArchitectureSummary(
  projectPath: string,
  config: DriftConfig | undefined,
): ContextArchitectureSummary {
  const modules = config?.modules ?? config?.moduleBoundaries ?? config?.boundaries ?? []
  return {
    layers: config?.layers?.map((layer) => layer.name) ?? [],
    modules: modules.map((module) => module.name),
    circularDependencies: countCircularDependencies(projectPath),
  }
}
