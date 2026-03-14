import { writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { Project } from 'ts-morph'
import type { DriftConfig } from './types.js'
import { detectLayerViolations } from './rules/phase3-arch.js'
import { RULE_WEIGHTS } from './analyzer.js'

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

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateArchitectureSvg(targetPath: string, config?: DriftConfig): string {
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

  const layers = new Map<string, LayerNode>()
  const edges = new Map<string, number>()
  const layerAdjacency = new Map<string, Set<string>>()
  const fileImportGraph = new Map<string, Set<string>>()

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath()
    const rel = relative(targetPath, filePath).replace(/\\/g, '/')
    const layerName = detectLayer(rel)
    if (!layers.has(layerName)) layers.set(layerName, { name: layerName, files: new Set() })
    layers.get(layerName)!.files.add(rel)
    if (!fileImportGraph.has(filePath)) fileImportGraph.set(filePath, new Set())

    for (const decl of file.getImportDeclarations()) {
      const imported = decl.getModuleSpecifierSourceFile()
      if (!imported) continue
      fileImportGraph.get(filePath)!.add(imported.getFilePath())
      const importedRel = relative(targetPath, imported.getFilePath()).replace(/\\/g, '/')
      const importedLayer = detectLayer(importedRel)
      if (importedLayer === layerName) continue
      const key = `${layerName}->${importedLayer}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
      if (!layerAdjacency.has(layerName)) layerAdjacency.set(layerName, new Set())
      layerAdjacency.get(layerName)!.add(importedLayer)
    }
  }

  const cycleEdges = detectCycleEdges(layerAdjacency)
  const violationEdges = new Set<string>()

  if (config?.layers && config.layers.length > 0) {
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
  }

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

  const layerList = [...layers.values()].sort((a, b) => a.name.localeCompare(b.name))
  const width = 960
  const rowHeight = 90
  const height = Math.max(180, layerList.length * rowHeight + 120)
  const boxWidth = 240
  const boxHeight = 50
  const left = 100

  const boxes = layerList.map((layer, index) => {
    const y = 60 + index * rowHeight
    return {
      ...layer,
      x: left,
      y,
    }
  })

  const boxByName = new Map(boxes.map((box) => [box.name, box]))

  const lines = edgeList.map((edge) => {
    const a = boxByName.get(edge.from)
    const b = boxByName.get(edge.to)
    if (!a || !b) return ''
    const startX = a.x + boxWidth
    const startY = a.y + boxHeight / 2
    const endX = b.x
    const endY = b.y + boxHeight / 2
    const stroke = edge.kind === 'violation'
      ? '#ef4444'
      : edge.kind === 'cycle'
        ? '#f59e0b'
        : '#64748b'
    const widthPx = edge.kind === 'normal' ? 2 : 3
    return `
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${stroke}" stroke-width="${widthPx}" marker-end="url(#arrow)" data-edge="${esc(edge.key)}" data-kind="${edge.kind}" />
      <text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 4}" fill="#94a3b8" font-size="11" text-anchor="middle">${edge.count}</text>`
  }).join('')

  const nodes = boxes.map((box) => `
    <g>
      <rect x="${box.x}" y="${box.y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#0f172a" stroke="#334155" />
      <text x="${box.x + 12}" y="${box.y + 22}" fill="#e2e8f0" font-size="13" font-family="monospace">${esc(box.name)}</text>
      <text x="${box.x + 12}" y="${box.y + 38}" fill="#94a3b8" font-size="11" font-family="monospace">${box.files.size} file(s)</text>
    </g>`).join('')

  const cycleCount = edgeList.filter((edge) => edge.kind === 'cycle').length
  const violationCount = edgeList.filter((edge) => edge.kind === 'violation').length

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L7,3 z" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#020617" />
  <text x="28" y="34" fill="#f8fafc" font-size="16" font-family="monospace">drift architecture map</text>
  <text x="28" y="54" fill="#94a3b8" font-size="11" font-family="monospace">Layers inferred from top-level directories</text>
  <text x="28" y="72" fill="#94a3b8" font-size="11" font-family="monospace">Cycle edges: ${cycleCount} | Layer violations: ${violationCount}</text>
  <line x1="520" y1="66" x2="560" y2="66" stroke="#f59e0b" stroke-width="3" /><text x="567" y="69" fill="#94a3b8" font-size="11" font-family="monospace">cycle</text>
  <line x1="630" y1="66" x2="670" y2="66" stroke="#ef4444" stroke-width="3" /><text x="677" y="69" fill="#94a3b8" font-size="11" font-family="monospace">violation</text>
  ${lines}
  ${nodes}
</svg>`
}

function detectCycleEdges(adjacency: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []
  const cycleEdges = new Set<string>()

  function dfs(node: string): void {
    visited.add(node)
    inStack.add(node)
    stack.push(node)

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
        continue
      }

      if (!inStack.has(neighbor)) continue

      const startIndex = stack.indexOf(neighbor)
      if (startIndex >= 0) {
        for (let i = startIndex; i < stack.length - 1; i++) {
          cycleEdges.add(`${stack[i]}->${stack[i + 1]}`)
        }
      }
      cycleEdges.add(`${node}->${neighbor}`)
    }

    stack.pop()
    inStack.delete(node)
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) dfs(node)
  }

  return cycleEdges
}

export function generateArchitectureMap(targetPath: string, outputFile = 'architecture.svg', config?: DriftConfig): string {
  const resolvedTarget = resolve(targetPath)
  const svg = generateArchitectureSvg(resolvedTarget, config)
  const outPath = resolve(outputFile)
  writeFileSync(outPath, svg, 'utf8')
  return outPath
}
