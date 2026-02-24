import type {} from './types.js'

const LEFT_WIDTH = 47
const CHAR_WIDTH = 7
const PADDING = 16

function scoreColor(score: number): string {
  if (score < 20) return '#4c1'
  if (score < 45) return '#dfb317'
  if (score < 70) return '#fe7d37'
  return '#e05d44'
}

function scoreLabel(score: number): string {
  if (score < 20) return 'LOW'
  if (score < 45) return 'MODERATE'
  if (score < 70) return 'HIGH'
  return 'CRITICAL'
}

function rightWidth(text: string): number {
  return text.length * CHAR_WIDTH + PADDING
}

export function generateBadge(score: number): string {
  const valueText = `${score} ${scoreLabel(score)}`
  const color = scoreColor(score)

  const rWidth = rightWidth(valueText)
  const totalWidth = LEFT_WIDTH + rWidth

  const leftCenterX = LEFT_WIDTH / 2
  const rightCenterX = LEFT_WIDTH + rWidth / 2

  // shields.io pattern: font-size="110" + scale(.1) = effective 11px
  // all X/Y coords are ×10
  const leftTextWidth = (LEFT_WIDTH - 10) * 10
  const rightTextWidth = (rWidth - PADDING) * 10

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${LEFT_WIDTH}" height="20" fill="#555"/>
    <rect x="${LEFT_WIDTH}" width="${rWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
    <text x="${leftCenterX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${leftTextWidth}" lengthAdjust="spacing">drift</text>
    <text x="${leftCenterX * 10}" y="140" transform="scale(.1)" textLength="${leftTextWidth}" lengthAdjust="spacing">drift</text>
    <text x="${rightCenterX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${rightTextWidth}" lengthAdjust="spacing">${valueText}</text>
    <text x="${rightCenterX * 10}" y="140" transform="scale(.1)" textLength="${rightTextWidth}" lengthAdjust="spacing">${valueText}</text>
  </g>
</svg>`
}
