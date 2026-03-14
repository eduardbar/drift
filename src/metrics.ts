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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function listFilesRecursively(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    const entries = readdirSync(current)
    for (const entry of entries) {
      const full = join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '.next' || entry === 'build') {
          continue
        }
        stack.push(full)
      } else {
        out.push(full)
      }
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
  return clamp(100 - Math.round((count / totalFiles) * 20), 0, 100)
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
  ) / 4)

  return { overall, dimensions }
}

export function computeMaintenanceRisk(report: DriftReport): MaintenanceRiskMetrics {
  const allFiles = report.files
  const hotspots: RiskHotspot[] = allFiles
    .map((file) => {
      const complexityIssues = file.issues.filter((issue) =>
        issue.rule === 'high-complexity' ||
        issue.rule === 'deep-nesting' ||
        issue.rule === 'large-function' ||
        issue.rule === 'max-function-lines'
      ).length

      const changeFrequency = getCommitTouchCount(report.targetPath, file.path)
      const hasTests = hasNearbyTest(report.targetPath, file.path)
      const reasons: string[] = []
      let risk = 0

      if (complexityIssues > 0) {
        risk += Math.min(40, complexityIssues * 10)
        reasons.push('high complexity signals')
      }
      if (!hasTests) {
        risk += 25
        reasons.push('no nearby tests')
      }
      if (changeFrequency >= 8) {
        risk += 20
        reasons.push('frequently changed file')
      }
      if (file.score >= 50) {
        risk += 15
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
    })
    .filter((hotspot) => hotspot.risk > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 10)

  const highComplexityFiles = hotspots.filter((hotspot) => hotspot.complexityIssues > 0).length
  const filesWithoutNearbyTests = hotspots.filter((hotspot) => !hotspot.hasNearbyTests).length
  const frequentChangeFiles = hotspots.filter((hotspot) => hotspot.changeFrequency >= 8).length

  const score = hotspots.length === 0
    ? 0
    : Math.round(hotspots.reduce((sum, hotspot) => sum + hotspot.risk, 0) / hotspots.length)

  const level = score >= 75
    ? 'critical'
    : score >= 55
      ? 'high'
      : score >= 30
        ? 'medium'
        : 'low'

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
