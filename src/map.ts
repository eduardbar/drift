import { writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { Project } from 'ts-morph'

interface LayerNode {
  name: string
  files: Set<string>
}

function detectLayer(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const first = normalized.split('/')[0] || 'root'
  return first
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateArchitectureSvg(targetPath: string): string {
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

  for (const file of project.getSourceFiles()) {
    const rel = relative(targetPath, file.getFilePath()).replace(/\\/g, '/')
    const layerName = detectLayer(rel)
    if (!layers.has(layerName)) layers.set(layerName, { name: layerName, files: new Set() })
    layers.get(layerName)!.files.add(rel)

    for (const decl of file.getImportDeclarations()) {
      const imported = decl.getModuleSpecifierSourceFile()
      if (!imported) continue
      const importedRel = relative(targetPath, imported.getFilePath()).replace(/\\/g, '/')
      const importedLayer = detectLayer(importedRel)
      if (importedLayer === layerName) continue
      const key = `${layerName}->${importedLayer}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
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

  const lines = [...edges.entries()].map(([key, count]) => {
    const [from, to] = key.split('->')
    const a = boxByName.get(from)
    const b = boxByName.get(to)
    if (!a || !b) return ''
    const startX = a.x + boxWidth
    const startY = a.y + boxHeight / 2
    const endX = b.x
    const endY = b.y + boxHeight / 2
    return `
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)" />
      <text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 4}" fill="#94a3b8" font-size="11" text-anchor="middle">${count}</text>`
  }).join('')

  const nodes = boxes.map((box) => `
    <g>
      <rect x="${box.x}" y="${box.y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#0f172a" stroke="#334155" />
      <text x="${box.x + 12}" y="${box.y + 22}" fill="#e2e8f0" font-size="13" font-family="monospace">${esc(box.name)}</text>
      <text x="${box.x + 12}" y="${box.y + 38}" fill="#94a3b8" font-size="11" font-family="monospace">${box.files.size} file(s)</text>
    </g>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L7,3 z" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#020617" />
  <text x="28" y="34" fill="#f8fafc" font-size="16" font-family="monospace">drift architecture map</text>
  <text x="28" y="54" fill="#94a3b8" font-size="11" font-family="monospace">Layers inferred from top-level directories</text>
  ${lines}
  ${nodes}
</svg>`
}

export function generateArchitectureMap(targetPath: string, outputFile = 'architecture.svg'): string {
  const resolvedTarget = resolve(targetPath)
  const svg = generateArchitectureSvg(resolvedTarget)
  const outPath = resolve(outputFile)
  writeFileSync(outPath, svg, 'utf8')
  return outPath
}
