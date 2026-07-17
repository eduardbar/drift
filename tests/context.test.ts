import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildContextDocument,
  checkContextFreshness,
  formatContextMarkdown,
  writeContextFile,
} from '../src/context.js'
import type { AIOutput, DriftConfig, DriftReport } from '../src/types.js'

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function buildMockReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    scannedAt: '2026-07-17T10:00:00.000Z',
    targetPath: '/project',
    files: [],
    totalIssues: 0,
    totalScore: 100,
    totalFiles: 1,
    summary: { errors: 0, warnings: 0, infos: 0, byRule: {} },
    quality: {
      overall: 100,
      dimensions: { architecture: 100, complexity: 100, 'ai-patterns': 100, testing: 100 },
    },
    maintenanceRisk: {
      score: 0,
      level: 'low',
      hotspots: [],
      signals: { highComplexityFiles: 0, filesWithoutNearbyTests: 0, frequentChangeFiles: 0 },
    },
    ...overrides,
  }
}

function buildMockAIOutput(overrides: Partial<AIOutput> = {}): AIOutput {
  return {
    summary: {
      score: 100,
      grade: 'CLEAN',
      total_issues: 0,
      files_affected: 0,
      files_clean: 1,
      ai_likelihood: 0,
      ai_code_smell_score: 0,
    },
    files_suspected: [],
    priority_order: [],
    maintenance_risk: {
      score: 0,
      level: 'low',
      hotspots: [],
      signals: { highComplexityFiles: 0, filesWithoutNearbyTests: 0, frequentChangeFiles: 0 },
    },
    quality: {
      overall: 100,
      dimensions: { architecture: 100, complexity: 100, 'ai-patterns': 100, testing: 100 },
    },
    context_for_ai: {
      project_type: 'typescript',
      scan_path: '/project',
      rules_detected: [],
      recommended_action: 'No issues detected. Codebase looks clean.',
    },
    ...overrides,
  }
}

describe('context-file', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  describe('buildContextDocument', () => {
    it('builds a document for a clean project', () => {
      const projectDir = createTempDir('drift-context-clean-')
      tempDirs.push(projectDir)
      writeFileSync(join(projectDir, 'a.ts'), 'export const a = 1\n')

      const report = buildMockReport({ targetPath: projectDir, totalScore: 0 })
      const aiOutput = buildMockAIOutput()
      const doc = buildContextDocument(projectDir, report, aiOutput)

      expect(doc.projectPath).toBe(projectDir)
      expect(doc.driftVersion).toMatch(/^\d+\.\d+\.\d+/)
      expect(doc.health.score).toBe(0)
      expect(doc.health.grade).toBe('CLEAN')
      expect(doc.topViolations).toHaveLength(0)
      expect(doc.guidelines).toContain('No active violations — codebase is clean.')
      expect(doc.recommendedActions).toContain('No issues detected. Codebase looks clean.')
    })

    it('includes top violations capped by maxIssues', () => {
      const projectDir = createTempDir('drift-context-violations-')
      tempDirs.push(projectDir)
      const issues = Array.from({ length: 50 }, (_, i) => ({
        rule: 'debug-leftover',
        severity: 'warning' as const,
        message: `console.log found ${i}`,
        line: i + 1,
        column: 1,
        snippet: 'console.log(1)',
      }))
      const report = buildMockReport({
        targetPath: projectDir,
        totalScore: 60,
        totalIssues: 50,
        files: [{ path: 'a.ts', score: 60, issues }],
        summary: { errors: 0, warnings: 50, infos: 0, byRule: { 'debug-leftover': 50 } },
      })
      const aiOutput = buildMockAIOutput({
        summary: {
          score: 60,
          grade: 'HIGH',
          total_issues: 50,
          files_affected: 1,
          files_clean: 0,
          ai_likelihood: 0,
          ai_code_smell_score: 0,
        },
        priority_order: issues.map((issue, i) => ({
          rank: i + 1,
          file: 'a.ts',
          line: issue.line,
          rule: issue.rule,
          severity: issue.severity,
          message: issue.message,
          snippet: issue.snippet,
          fix_suggestion: 'Remove the debug leftover.',
          effort: 'low' as const,
        })),
        context_for_ai: {
          project_type: 'typescript',
          scan_path: projectDir,
          rules_detected: ['debug-leftover'],
          recommended_action: 'Focus on fixing 50 low-effort issue(s) first - they are quick wins.',
        },
      })

      const doc = buildContextDocument(projectDir, report, aiOutput, undefined, { maxIssues: 10 })
      expect(doc.topViolations).toHaveLength(10)
      expect(doc.topViolations[0].rank).toBe(1)
      expect(doc.health.filesAffected).toBe(1)
      expect(doc.health.filesClean).toBe(0)
    })

    it('reads architecture summary from config', () => {
      const projectDir = createTempDir('drift-context-arch-')
      tempDirs.push(projectDir)
      const config: DriftConfig = {
        layers: [{ name: 'api', patterns: ['src/routes/**'], canImportFrom: [] }],
        modules: [{ name: 'shared', root: 'packages/shared', allowedExternalImports: [] }],
      }
      const report = buildMockReport({ targetPath: projectDir })
      const aiOutput = buildMockAIOutput()

      const doc = buildContextDocument(projectDir, report, aiOutput, config)
      expect(doc.architectureSummary.layers).toEqual(['api'])
      expect(doc.architectureSummary.modules).toEqual(['shared'])
    })

    it('derives guidelines from detected rules', () => {
      const projectDir = createTempDir('drift-context-guidelines-')
      tempDirs.push(projectDir)
      const report = buildMockReport({
        targetPath: projectDir,
        totalScore: 80,
        totalIssues: 1,
        files: [{
          path: 'a.ts',
          score: 80,
          issues: [{
            rule: 'debug-leftover',
            severity: 'warning',
            message: 'console.log found',
            line: 1,
            column: 1,
            snippet: 'console.log(1)',
          }],
        }],
        summary: { errors: 0, warnings: 1, infos: 0, byRule: { 'debug-leftover': 1 } },
      })
      const aiOutput = buildMockAIOutput({
        context_for_ai: {
          project_type: 'typescript',
          scan_path: projectDir,
          rules_detected: ['debug-leftover'],
          recommended_action: 'Start with the highest priority issue.',
        },
      })

      const doc = buildContextDocument(projectDir, report, aiOutput)
      expect(doc.guidelines.some((g) => g.includes('debug-leftover'))).toBe(true)
      expect(doc.recommendedActions).toContain('Start with the highest priority issue.')
    })
  })

  describe('formatContextMarkdown', () => {
    it('formats all required sections', () => {
      const doc = buildContextDocument(
        '/project',
        buildMockReport(),
        buildMockAIOutput(),
      )
      const md = formatContextMarkdown(doc)

      expect(md).toContain('# Drift Context')
      expect(md).toContain('## Project Health')
      expect(md).toContain('## Active Violations')
      expect(md).toContain('## Architecture Summary')
      expect(md).toContain('## AI Coding Guidelines')
      expect(md).toContain('## Recommended Actions')
      expect(md).toContain('<!-- drift-context-metadata:')
      expect(md).toContain('score=100')
    })

    it('renders violation entries with file, line, rule, and suggestion', () => {
      const doc = buildContextDocument(
        '/project',
        buildMockReport({
          totalScore: 80,
          totalIssues: 1,
          files: [{
            path: 'src/app.ts',
            score: 80,
            issues: [{
              rule: 'debug-leftover',
              severity: 'warning',
              message: 'console.log found',
              line: 10,
              column: 1,
              snippet: 'console.log(1)',
            }],
          }],
          summary: { errors: 0, warnings: 1, infos: 0, byRule: { 'debug-leftover': 1 } },
        }),
        buildMockAIOutput({
          priority_order: [{
            rank: 1,
            file: 'src/app.ts',
            line: 10,
            rule: 'debug-leftover',
            severity: 'warning',
            message: 'console.log found',
            snippet: 'console.log(1)',
            fix_suggestion: 'Remove the debug leftover.',
            effort: 'low',
          }],
          context_for_ai: {
            project_type: 'typescript',
            scan_path: '/project',
            rules_detected: ['debug-leftover'],
            recommended_action: 'Fix it.',
          },
        }),
      )
      const md = formatContextMarkdown(doc)

      expect(md).toContain('src/app.ts')
      expect(md).toContain('Line 10')
      expect(md).toContain('debug-leftover')
      expect(md).toContain('Remove the debug leftover.')
    })

    it('states no violations when the list is empty', () => {
      const doc = buildContextDocument('/project', buildMockReport(), buildMockAIOutput())
      const md = formatContextMarkdown(doc)
      expect(md).toContain('No active violations')
    })
  })

  describe('writeContextFile', () => {
    it('writes markdown and creates the output directory', () => {
      const dir = createTempDir('drift-context-write-')
      tempDirs.push(dir)
      const nested = join(dir, 'nested', 'context.md')
      const doc = buildContextDocument(dir, buildMockReport(), buildMockAIOutput())

      writeContextFile(nested, doc)

      expect(existsSync(nested)).toBe(true)
      const content = readFileSync(nested, 'utf8')
      expect(content).toContain('# Drift Context')
      expect(content).toContain('<!-- drift-context-metadata:')
    })
  })

  describe('checkContextFreshness', () => {
    it('reports missing file', () => {
      const dir = createTempDir('drift-context-fresh-missing-')
      tempDirs.push(dir)
      const result = checkContextFreshness(join(dir, 'missing.md'), 80)
      expect(result.missing).toBe(true)
      expect(result.fresh).toBe(false)
    })

    it('reports fresh when score matches within threshold', () => {
      const dir = createTempDir('drift-context-fresh-match-')
      tempDirs.push(dir)
      const doc = buildContextDocument(dir, buildMockReport({ totalScore: 80 }), buildMockAIOutput())
      const path = join(dir, 'context.md')
      writeContextFile(path, doc)

      const result = checkContextFreshness(path, 80)
      expect(result.missing).toBe(false)
      expect(result.fresh).toBe(true)
      expect(result.recordedScore).toBe(80)
    })

    it('reports stale when score delta exceeds threshold', () => {
      const dir = createTempDir('drift-context-fresh-stale-')
      tempDirs.push(dir)
      const doc = buildContextDocument(dir, buildMockReport({ totalScore: 80 }), buildMockAIOutput())
      const path = join(dir, 'context.md')
      writeContextFile(path, doc)

      const result = checkContextFreshness(path, 65)
      expect(result.missing).toBe(false)
      expect(result.fresh).toBe(false)
      expect(result.recordedScore).toBe(80)
      expect(result.delta).toBe(15)
    })
  })
})
