import { existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, relative } from 'node:path'
import type { DriftIssue, DriftReport, FileReport, MaintenanceRiskMetrics, RepoQualityScore, RiskHotspot } from './types.js'

const ARCH_RULES = new Set([
  'circular-dependency',
  'layer-violation',
  'cross-boundary-import',
  'controller-no-db',
  'service-no-http',
])

const COMPLEXITY_RULES = new Set([
  'large-file',
  'large-function',
  'high-complexity',
  'deep-nesting',
  'too-many-params',
  'max-function-lines',
])

const AI_RULES = new Set([
  'over-commented',
  'hardcoded-config',
  'inconsistent-error-handling',
  'unnecessary-abstraction',
  'naming-inconsistency',
  'comment-contradiction',
  'ai-code-smell',
])

const ISSUE_WEIGHT_PER_FILE = 20
const DIMENSION_COUNT = 4
const MAX_COMPLEXITY_RISK = 40
const COMPLEXITY_RISK_PER_ISSUE = 10
const MISSING_TESTS_RISK = 25
const FREQUENT_CHANGE_THRESHOLD = 8
const FREQUENT_CHANGE_RISK = 20
const HIGH_DRIFT_THRESHOLD = 50
const HIGH_DRIFT_RISK = 15
const HOTSPOT_LIMIT = 10
const LEVEL_CRITICAL_THRESHOLD = 75
const LEVEL_HIGH_THRESHOLD = 55
const LEVEL_MEDIUM_THRESHOLD = 30

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function listFilesRecursively(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const stack = [root]

  const shouldSkipDirectory = (name: string): boolean =>
    name === 'node_modules' || name === 'dist' || name === '.git' || name === '.next' || name === 'build'

  while (stack.length > 0) {
    const current = stack.pop()!
    const entries = readdirSync(current)
    for (const entry of entries) {
      const full = join(current, entry)
      const stat = statSync(full)
      if (!stat.isDirectory()) {
        out.push(full)
        continue
      }

      if (shouldSkipDirectory(entry)) continue
      stack.push(full)
    }
  }
  return out
}

function hasNearbyTest(targetPath: string, filePath: string): boolean {
  const rel = relative(targetPath, filePath).replace(/\\/g, '/')
  const noExt = rel.replace(/\.[^.]+$/, '')
  const candidates = [
    `${noExt}.test.ts`,
    `${noExt}.test.tsx`,
    `${noExt}.spec.ts`,
    `${noExt}.spec.tsx`,
    `${noExt}.test.js`,
    `${noExt}.spec.js`,
  ]
  return candidates.some((candidate) => existsSync(join(targetPath, candidate)))
}

function getCommitTouchCount(targetPath: string, filePath: string): number {
  try {
    const rel = relative(targetPath, filePath).replace(/\\/g, '/')
    const output = execSync(`git rev-list --count HEAD -- "${rel}"`, {
      cwd: targetPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return Number(output) || 0
  } catch {
    return 0
  }
}

function qualityFromIssues(totalFiles: number, issues: DriftIssue[], rules: Set<string>): number {
  const count = issues.filter((issue) => rules.has(issue.rule)).length
  if (totalFiles === 0) return 100
  return clamp(100 - Math.round((count / totalFiles) * ISSUE_WEIGHT_PER_FILE), 0, 100)
}

function riskLevelFromScore(score: number): MaintenanceRiskMetrics['level'] {
  if (score >= LEVEL_CRITICAL_THRESHOLD) return 'critical'
  if (score >= LEVEL_HIGH_THRESHOLD) return 'high'
  if (score >= LEVEL_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

function evaluateHotspot(targetPath: string, file: FileReport): RiskHotspot {
  const complexityIssues = file.issues.filter((issue) =>
    issue.rule === 'high-complexity' ||
    issue.rule === 'deep-nesting' ||
    issue.rule === 'large-function' ||
    issue.rule === 'max-function-lines'
  ).length

  const changeFrequency = getCommitTouchCount(targetPath, file.path)
  const hasTests = hasNearbyTest(targetPath, file.path)
  const reasons: string[] = []
  let risk = 0

  if (complexityIssues > 0) {
    risk += Math.min(MAX_COMPLEXITY_RISK, complexityIssues * COMPLEXITY_RISK_PER_ISSUE)
    reasons.push('high complexity signals')
  }
  if (!hasTests) {
    risk += MISSING_TESTS_RISK
    reasons.push('no nearby tests')
  }
  if (changeFrequency >= FREQUENT_CHANGE_THRESHOLD) {
    risk += FREQUENT_CHANGE_RISK
    reasons.push('frequently changed file')
  }
  if (file.score >= HIGH_DRIFT_THRESHOLD) {
    risk += HIGH_DRIFT_RISK
    reasons.push('high drift score')
  }

  return {
    file: file.path,
    driftScore: file.score,
    complexityIssues,
    hasNearbyTests: hasTests,
    changeFrequency,
    risk: clamp(risk, 0, 100),
    reasons,
  }
}

export function computeRepoQuality(targetPath: string, files: FileReport[]): RepoQualityScore {
  const allIssues = files.flatMap((file) => file.issues)
  const sourceFiles = files.filter((file) => !file.path.endsWith('package.json'))
  const totalFiles = Math.max(sourceFiles.length, 1)

  const testingCandidates = listFilesRecursively(targetPath).filter((filePath) =>
    /\.(ts|tsx|js|jsx)$/.test(filePath) &&
    !/\.test\.|\.spec\./.test(filePath) &&
    !filePath.includes('node_modules')
  )

  const withoutTests = testingCandidates.filter((filePath) => !hasNearbyTest(targetPath, filePath)).length
  const testing = testingCandidates.length === 0
    ? 100
    : clamp(100 - Math.round((withoutTests / testingCandidates.length) * 100), 0, 100)

  const dimensions = {
    architecture: qualityFromIssues(totalFiles, allIssues, ARCH_RULES),
    complexity: qualityFromIssues(totalFiles, allIssues, COMPLEXITY_RULES),
    'ai-patterns': qualityFromIssues(totalFiles, allIssues, AI_RULES),
    testing,
  }

  const overall = Math.round((
    dimensions.architecture +
    dimensions.complexity +
    dimensions['ai-patterns'] +
    dimensions.testing
  ) / DIMENSION_COUNT)

  return { overall, dimensions }
}

export function computeMaintenanceRisk(report: DriftReport): MaintenanceRiskMetrics {
  const hotspots: RiskHotspot[] = report.files
    .map((file) => evaluateHotspot(report.targetPath, file))
    .filter((hotspot) => hotspot.risk > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, HOTSPOT_LIMIT)

  const highComplexityFiles = hotspots.filter((hotspot) => hotspot.complexityIssues > 0).length
  const filesWithoutNearbyTests = hotspots.filter((hotspot) => !hotspot.hasNearbyTests).length
  const frequentChangeFiles = hotspots.filter((hotspot) => hotspot.changeFrequency >= FREQUENT_CHANGE_THRESHOLD).length

  const score = hotspots.length === 0
    ? 0
    : Math.round(hotspots.reduce((sum, hotspot) => sum + hotspot.risk, 0) / hotspots.length)

  const level = riskLevelFromScore(score)

  return {
    score,
    level,
    hotspots,
    signals: {
      highComplexityFiles,
      filesWithoutNearbyTests,
      frequentChangeFiles,
    },
  }
}
