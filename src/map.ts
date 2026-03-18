import { writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { Project } from 'ts-morph'
import type { DriftConfig } from './types.js'
import { detectLayerViolations } from './rules/phase3-arch.js'
import { RULE_WEIGHTS } from './analyzer.js'
import { detectCycleEdges } from './map-cycles.js'
import { renderArchitectureSvg } from './map-svg.js'

interface LayerNode {
  name: string
  files: Set<string>
}

interface MapEdge {
  key: string
  from: string
  to: string
  count: number
  kind: 'normal' | 'cycle' | 'violation'
}

function detectLayer(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const first = normalized.split('/')[0] || 'root'
  return first
}

function appendFileLayerContext(
  filePath: string,
  targetPath: string,
  layers: Map<string, LayerNode>,
  fileImportGraph: Map<string, Set<string>>,
): { rel: string; layerName: string } {
  const rel = relative(targetPath, filePath).replace(/\\/g, '/')
  const layerName = detectLayer(rel)

  if (!layers.has(layerName)) {
    layers.set(layerName, { name: layerName, files: new Set() })
  }

  layers.get(layerName)!.files.add(rel)

  if (!fileImportGraph.has(filePath)) {
    fileImportGraph.set(filePath, new Set())
  }

  return { rel, layerName }
}

function registerImportEdge(
  layerName: string,
  importedLayer: string,
  edges: Map<string, number>,
  layerAdjacency: Map<string, Set<string>>,
): void {
  if (importedLayer === layerName) return

  const key = `${layerName}->${importedLayer}`
  edges.set(key, (edges.get(key) ?? 0) + 1)

  if (!layerAdjacency.has(layerName)) {
    layerAdjacency.set(layerName, new Set())
  }

  layerAdjacency.get(layerName)!.add(importedLayer)
}

function buildEdgeList(edges: Map<string, number>, cycleEdges: Set<string>, violationEdges: Set<string>): MapEdge[] {
  const edgeList: MapEdge[] = [...edges.entries()].map(([key, count]) => {
    const [from, to] = key.split('->')
    const kind = violationEdges.has(key)
      ? 'violation'
      : cycleEdges.has(key)
        ? 'cycle'
        : 'normal'
    return { key, from, to, count, kind }
  })

  for (const key of violationEdges) {
    if (edges.has(key)) continue
    const [from, to] = key.split('->')
    edgeList.push({ key, from, to, count: 1, kind: 'violation' })
  }

  return edgeList
}


function createArchitectureProject(targetPath: string): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 1 },
  })

  project.addSourceFilesAtPaths([
    `${targetPath}/**/*.ts`,
    `${targetPath}/**/*.tsx`,
    `${targetPath}/**/*.js`,
    `${targetPath}/**/*.jsx`,
    `!${targetPath}/**/node_modules/**`,
    `!${targetPath}/**/dist/**`,
    `!${targetPath}/**/.next/**`,
    `!${targetPath}/**/*.d.ts`,
  ])

  return project
}

function collectArchitectureGraph(
  project: Project,
  targetPath: string,
): {
  layers: Map<string, LayerNode>
  edges: Map<string, number>
  layerAdjacency: Map<string, Set<string>>
  fileImportGraph: Map<string, Set<string>>
} {
  const layers = new Map<string, LayerNode>()
  const edges = new Map<string, number>()
  const layerAdjacency = new Map<string, Set<string>>()
  const fileImportGraph = new Map<string, Set<string>>()

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath()
    const { layerName } = appendFileLayerContext(filePath, targetPath, layers, fileImportGraph)

    for (const decl of file.getImportDeclarations()) {
      const imported = decl.getModuleSpecifierSourceFile()
      if (!imported) continue
      fileImportGraph.get(filePath)!.add(imported.getFilePath())
      const importedRel = relative(targetPath, imported.getFilePath()).replace(/\\/g, '/')
      const importedLayer = detectLayer(importedRel)
      registerImportEdge(layerName, importedLayer, edges, layerAdjacency)
    }
  }

  return { layers, edges, layerAdjacency, fileImportGraph }
}

function collectViolationEdges(
  config: DriftConfig | undefined,
  fileImportGraph: Map<string, Set<string>>,
  targetPath: string,
  layers: Map<string, LayerNode>,
): Set<string> {
  const violationEdges = new Set<string>()
  if (!config?.layers?.length) return violationEdges

  const violations = detectLayerViolations(fileImportGraph, config.layers, targetPath, RULE_WEIGHTS)
  for (const issues of violations.values()) {
    for (const issue of issues) {
      const match = issue.message.match(/Layer '([^']+)' must not import from layer '([^']+)'/)
      if (!match) continue
      const from = match[1]
      const to = match[2]
      violationEdges.add(`${from}->${to}`)
      if (!layers.has(from)) layers.set(from, { name: from, files: new Set() })
      if (!layers.has(to)) layers.set(to, { name: to, files: new Set() })
    }
  }

  return violationEdges
}

export function generateArchitectureSvg(targetPath: string, config?: DriftConfig): string {
  const project = createArchitectureProject(targetPath)
  const { layers, edges, layerAdjacency, fileImportGraph } = collectArchitectureGraph(project, targetPath)

  const cycleEdges = detectCycleEdges(layerAdjacency)
  const violationEdges = collectViolationEdges(config, fileImportGraph, targetPath, layers)

  const edgeList = buildEdgeList(edges, cycleEdges, violationEdges)
  return renderArchitectureSvg({
    layers,
    edgeList,
    cycleCount: edgeList.filter((edge) => edge.kind === 'cycle').length,
    violationCount: edgeList.filter((edge) => edge.kind === 'violation').length,
  })
}

export function generateArchitectureMap(targetPath: string, outputFile = 'architecture.svg', config?: DriftConfig): string {
  const resolvedTarget = resolve(targetPath)
  const svg = generateArchitectureSvg(resolvedTarget, config)
  const outPath = resolve(outputFile)
  writeFileSync(outPath, svg, 'utf8')
  return outPath
}
