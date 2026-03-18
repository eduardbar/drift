const SVG_WIDTH = 960
const ROW_HEIGHT = 90
const MIN_CANVAS_HEIGHT = 180
const BOTTOM_PADDING = 120
const BOX_WIDTH = 240
const BOX_HEIGHT = 50
const BOX_LEFT = 100
const BOX_TOP_OFFSET = 60

const NORMAL_EDGE_WIDTH = 2
const HIGHLIGHT_EDGE_WIDTH = 3
const EDGE_LABEL_Y_OFFSET = 4

const NODE_TITLE_X_OFFSET = 12
const NODE_TITLE_Y_OFFSET = 22
const NODE_META_X_OFFSET = 12
const NODE_META_Y_OFFSET = 38

const LEGEND_CYCLE_START_X = 520
const LEGEND_CYCLE_END_X = 560
const LEGEND_CYCLE_LABEL_X = 567
const LEGEND_VIOLATION_START_X = 630
const LEGEND_VIOLATION_END_X = 670
const LEGEND_VIOLATION_LABEL_X = 677
const LEGEND_LINE_Y = 66
const LEGEND_LABEL_Y = 69

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

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSvgLayout(layers: Map<string, LayerNode>): { width: number; height: number; boxes: Array<LayerNode & { x: number; y: number }> } {
  const layerList = [...layers.values()].sort((a, b) => a.name.localeCompare(b.name))
  const height = Math.max(MIN_CANVAS_HEIGHT, layerList.length * ROW_HEIGHT + BOTTOM_PADDING)
  const boxes = layerList.map((layer, index) => ({
    ...layer,
    x: BOX_LEFT,
    y: BOX_TOP_OFFSET + index * ROW_HEIGHT,
  }))

  return {
    width: SVG_WIDTH,
    height,
    boxes,
  }
}

function edgeStroke(kind: MapEdge['kind']): string {
  if (kind === 'violation') return '#ef4444'
  if (kind === 'cycle') return '#f59e0b'
  return '#64748b'
}

function edgeStrokeWidth(kind: MapEdge['kind']): number {
  return kind === 'normal' ? NORMAL_EDGE_WIDTH : HIGHLIGHT_EDGE_WIDTH
}

function renderEdges(edgeList: MapEdge[], boxByName: Map<string, LayerNode & { x: number; y: number }>): string {
  return edgeList.map((edge) => {
    const a = boxByName.get(edge.from)
    const b = boxByName.get(edge.to)
    if (!a || !b) return ''
    const startX = a.x + BOX_WIDTH
    const startY = a.y + BOX_HEIGHT / 2
    const endX = b.x
    const endY = b.y + BOX_HEIGHT / 2
    const stroke = edgeStroke(edge.kind)
    const widthPx = edgeStrokeWidth(edge.kind)
    return `
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${stroke}" stroke-width="${widthPx}" marker-end="url(#arrow)" data-edge="${esc(edge.key)}" data-kind="${edge.kind}" />
      <text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - EDGE_LABEL_Y_OFFSET}" fill="#94a3b8" font-size="11" text-anchor="middle">${edge.count}</text>`
  }).join('')
}

function renderNodes(boxes: Array<LayerNode & { x: number; y: number }>): string {
  return boxes.map((box) => `
    <g>
      <rect x="${box.x}" y="${box.y}" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" rx="8" fill="#0f172a" stroke="#334155" />
      <text x="${box.x + NODE_TITLE_X_OFFSET}" y="${box.y + NODE_TITLE_Y_OFFSET}" fill="#e2e8f0" font-size="13" font-family="monospace">${esc(box.name)}</text>
      <text x="${box.x + NODE_META_X_OFFSET}" y="${box.y + NODE_META_Y_OFFSET}" fill="#94a3b8" font-size="11" font-family="monospace">${box.files.size} file(s)</text>
    </g>`).join('')
}

export function renderArchitectureSvg(input: {
  layers: Map<string, LayerNode>
  edgeList: MapEdge[]
  cycleCount: number
  violationCount: number
}): string {
  const { width, height, boxes } = buildSvgLayout(input.layers)
  const boxByName = new Map(boxes.map((box) => [box.name, box]))

  const lines = renderEdges(input.edgeList, boxByName)
  const nodes = renderNodes(boxes)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L7,3 z" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#020617" />
  <text x="28" y="34" fill="#f8fafc" font-size="16" font-family="monospace">drift architecture map</text>
  <text x="28" y="54" fill="#94a3b8" font-size="11" font-family="monospace">Layers inferred from top-level directories</text>
  <text x="28" y="72" fill="#94a3b8" font-size="11" font-family="monospace">Cycle edges: ${input.cycleCount} | Layer violations: ${input.violationCount}</text>
  <line x1="${LEGEND_CYCLE_START_X}" y1="${LEGEND_LINE_Y}" x2="${LEGEND_CYCLE_END_X}" y2="${LEGEND_LINE_Y}" stroke="#f59e0b" stroke-width="${HIGHLIGHT_EDGE_WIDTH}" /><text x="${LEGEND_CYCLE_LABEL_X}" y="${LEGEND_LABEL_Y}" fill="#94a3b8" font-size="11" font-family="monospace">cycle</text>
  <line x1="${LEGEND_VIOLATION_START_X}" y1="${LEGEND_LINE_Y}" x2="${LEGEND_VIOLATION_END_X}" y2="${LEGEND_LINE_Y}" stroke="#ef4444" stroke-width="${HIGHLIGHT_EDGE_WIDTH}" /><text x="${LEGEND_VIOLATION_LABEL_X}" y="${LEGEND_LABEL_Y}" fill="#94a3b8" font-size="11" font-family="monospace">violation</text>
  ${lines}
  ${nodes}
</svg>`
}
