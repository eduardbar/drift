import type {} from './types.js'

const LEFT_WIDTH = 47
const CHAR_WIDTH = 7
const PADDING = 16
const SVG_SCALE = 10

const GRADE_THRESHOLDS = {
  LOW: 20,
  MODERATE: 45,
  HIGH: 70,
}

const GRADE_COLORS = {
  LOW: '#4c1',
  MODERATE: '#dfb317',
  HIGH: '#fe7d37',
  CRITICAL: '#e05d44',
}

const GRADE_LABELS = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
}

function scoreColor(score: number): string {
  if (score < GRADE_THRESHOLDS.LOW) return GRADE_COLORS.LOW
  if (score < GRADE_THRESHOLDS.MODERATE) return GRADE_COLORS.MODERATE
  if (score < GRADE_THRESHOLDS.HIGH) return GRADE_COLORS.HIGH
  return GRADE_COLORS.CRITICAL
}

function scoreLabel(score: number): string {
  if (score < GRADE_THRESHOLDS.LOW) return GRADE_LABELS.LOW
  if (score < GRADE_THRESHOLDS.MODERATE) return GRADE_LABELS.MODERATE
  if (score < GRADE_THRESHOLDS.HIGH) return GRADE_LABELS.HIGH
  return GRADE_LABELS.CRITICAL
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

  const leftTextWidth = (LEFT_WIDTH - PADDING) * SVG_SCALE
  const rightTextWidth = (rWidth - PADDING) * SVG_SCALE

  const leftCenterXScaled = leftCenterX * SVG_SCALE
  const rightCenterXScaled = rightCenterX * SVG_SCALE

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
    <text x="${leftCenterXScaled}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${leftTextWidth}" lengthAdjust="spacing">drift</text>
    <text x="${leftCenterXScaled}" y="140" transform="scale(.1)" textLength="${leftTextWidth}" lengthAdjust="spacing">drift</text>
    <text x="${rightCenterXScaled}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${rightTextWidth}" lengthAdjust="spacing">${valueText}</text>
    <text x="${rightCenterXScaled}" y="140" transform="scale(.1)" textLength="${rightTextWidth}" lengthAdjust="spacing">${valueText}</text>
  </g>
</svg>`
}
