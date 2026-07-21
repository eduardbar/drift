import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
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
import { pathToFileURL } from 'node:url'
import {
  buildContextDocument,
  checkContextFreshness,
  writeContextFile,
  runWatch,
  validateAnalysisTarget,
} from '../src/context.js'
import { generateContextFile } from '../src/context-init.js'
import { formatContextMarkdown } from '../src/context-markdown.js'
import { runInit } from '../src/init.js'
import type { AIOutput, DriftConfig, DriftReport } from '../src/types.js'

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts')
const TSX_LOADER = pathToFileURL(join(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs')).href

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, ['--import', TSX_LOADER, CLI_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status: number | null }
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    }
  }
}

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

      const doc = buildContextDocument(projectDir, report, aiOutput, { maxIssues: 10 })
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

      const doc = buildContextDocument(projectDir, report, aiOutput, { config })
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

    it('preserves an existing destination and cleans the temporary file when replacement fails', () => {
      const dir = createTempDir('drift-context-atomic-failure-')
      tempDirs.push(dir)
      const outputPath = join(dir, 'context.md')
      const original = 'existing context\n'
      writeFileSync(outputPath, original)
      const doc = buildContextDocument(dir, buildMockReport(), buildMockAIOutput())
      expect(() => writeContextFile(outputPath, doc, {
        renameSync: () => {
          throw new Error('simulated rename failure')
        },
      })).toThrow('simulated rename failure')
      expect(readFileSync(outputPath, 'utf8')).toBe(original)
      expect(fs.readdirSync(dir)).toEqual(['context.md'])
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

  describe('runInit --context', () => {
    it('generates context file and appends .gitignore', async () => {
      const dir = createTempDir('drift-init-context-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const output: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output.push(String(chunk))
        return true
      })
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      await runInit(dir, { context: true })

      const contextPath = join(dir, '.drift', 'context.md')
      expect(existsSync(contextPath)).toBe(true)
      const content = readFileSync(contextPath, 'utf8')
      expect(content).toContain('# Drift Context')

      const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('.drift/context.md')
    })
  })

  describe('drift context CLI', () => {
    it('writes a valid deterministic zero-file context for an empty project', async () => {
      const dir = createTempDir('drift-cli-context-empty-')
      tempDirs.push(dir)
      const outputPath = join(dir, '.drift', 'context.md')

      const doc = await generateContextFile(dir, outputPath)
      const content = readFileSync(outputPath, 'utf8')

      expect(doc.projectPath).toBe(dir)
      expect(doc.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(doc.health).toMatchObject({
        score: 0,
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        filesAffected: 0,
        filesClean: 0,
      })
      expect(content).toContain('# Drift Context')
      expect(content).toContain('No active violations.')
      expect(content).toContain('score=0')
    })

    it('writes default .drift/context.md', () => {
      const dir = createTempDir('drift-cli-context-default-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const { exitCode } = runCli(['context'], dir)
      expect(exitCode).toBe(0)

      const contextPath = join(dir, '.drift', 'context.md')
      expect(existsSync(contextPath)).toBe(true)
      const content = readFileSync(contextPath, 'utf8')
      expect(content).toContain('# Drift Context')
      expect(content).toContain('<!-- drift-context-metadata:')
    })

    it('writes to custom output path and not default', () => {
      const dir = createTempDir('drift-cli-context-output-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      const customPath = join(dir, 'docs', 'ai-context.md')

      const { exitCode } = runCli(['context', '--output', customPath], dir)
      expect(exitCode).toBe(0)

      expect(existsSync(customPath)).toBe(true)
      expect(existsSync(join(dir, '.drift', 'context.md'))).toBe(false)
    })

    it('emits JSON to stdout and writes no file', () => {
      const dir = createTempDir('drift-cli-context-json-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const { stdout, exitCode } = runCli(['context', '--format', 'json'], dir)
      expect(exitCode).toBe(0)

      const parsed = JSON.parse(stdout) as { projectPath: string; health: { score: number } }
      expect(parsed.projectPath).toBe(dir)
      expect(typeof parsed.health.score).toBe('number')
      expect(existsSync(join(dir, '.drift', 'context.md'))).toBe(false)
    })

    it('exits 1 in CI mode when file is stale', () => {
      const dir = createTempDir('drift-cli-context-ci-stale-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const doc = buildContextDocument(dir, buildMockReport({ totalScore: 80 }), buildMockAIOutput())
      mkdirSync(join(dir, '.drift'), { recursive: true })
      writeContextFile(join(dir, '.drift', 'context.md'), doc)

      // Add a violation to make current score worse than recorded 80
      writeFileSync(join(dir, 'a.ts'), 'console.log("debug")\n')

      const { stderr, exitCode } = runCli(['context', '--ci'], dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('stale')
    })

    it('exits 0 in CI mode when file is fresh', () => {
      const dir = createTempDir('drift-cli-context-ci-fresh-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const { exitCode } = runCli(['context'], dir)
      expect(exitCode).toBe(0)

      const { exitCode: ciExitCode } = runCli(['context', '--ci'], dir)
      expect(ciExitCode).toBe(0)
    })

    it('exits 1 in CI mode when context file is missing', () => {
      const dir = createTempDir('drift-cli-context-ci-missing-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      const { stderr, exitCode } = runCli(['context', '--ci'], dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('missing')
    })

    it('exits 1 and writes no file for unwritable output path', () => {
      const dir = createTempDir('drift-cli-context-unwritable-')
      tempDirs.push(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      // Using an existing directory as the output path forces a write error.
      const outputPath = dir

      const { stderr, exitCode } = runCli(['context', '--output', outputPath], dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('Error')
    })

    it('regenerates on source changes, ignores atomic output artifacts, and shuts down cleanly', async () => {
      const dir = createTempDir('drift-cli-context-watch-')
      tempDirs.push(dir)
      const sourceFile = join(dir, 'a.ts')
      writeFileSync(sourceFile, 'export const a = 1\n')

      const child = spawn(process.execPath, ['--import', TSX_LOADER, CLI_PATH, 'context', '--watch'], {
        cwd: dir,
        stdio: 'pipe',
      })

      const stderr: string[] = []
      child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))

      try {
        const contextPath = join(dir, '.drift', 'context.md')
        await vi.waitFor(() => expect(existsSync(contextPath)).toBe(true), { timeout: 10000 })
        const before = readFileSync(contextPath, 'utf8')

        writeFileSync(sourceFile, 'export const a = 2\nconsole.log(a)\n')

        await vi.waitFor(() => {
          const after = readFileSync(contextPath, 'utf8')
          expect(after).not.toBe(before)
        }, { timeout: 5000 })

        const regenerated = readFileSync(contextPath, 'utf8')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        expect(readFileSync(contextPath, 'utf8')).toBe(regenerated)
        expect(stderr.join('')).toContain('Watching')
      } finally {
        child.kill('SIGTERM')
        const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          child.once('error', reject)
          child.once('exit', (code, signal) => resolve({ code, signal }))
        })
        expect(child.killed).toBe(true)
        expect(exitResult.code === 0 || (process.platform === 'win32' && exitResult.code === null)).toBe(true)
        expect(exitResult.signal === null || (process.platform === 'win32' && exitResult.signal === 'SIGTERM')).toBe(true)
      }
    })

    it('rejects an invalid target before creating output directories', () => {
      const dir = createTempDir('drift-cli-context-invalid-target-')
      tempDirs.push(dir)
      const invalidTarget = join(dir, 'missing-project')

      const { stderr, exitCode } = runCli(['context', invalidTarget], dir)

      expect(exitCode).toBe(1)
      expect(stderr).toContain('target')
      expect(existsSync(invalidTarget)).toBe(false)
    })

    it('rejects a file target without creating a sibling output directory', () => {
      const dir = createTempDir('drift-cli-context-file-target-')
      tempDirs.push(dir)
      const targetFile = join(dir, 'target.ts')
      writeFileSync(targetFile, 'export const value = 1\n')

      const { stderr, exitCode } = runCli(['context', targetFile], dir)

      expect(exitCode).toBe(1)
      expect(stderr).toContain('directory')
      expect(existsSync(`${targetFile}.drift`)).toBe(false)
    })

    it('rejects an unreadable directory through the filesystem seam without creating output', async () => {
      const dir = createTempDir('drift-cli-context-unreadable-target-')
      tempDirs.push(dir)
      const target = join(dir, 'restricted')
      const outputPath = join(target, '.drift', 'context.md')
      mkdirSync(target)

      await expect(generateContextFile(target, outputPath, {}, {
        fileSystem: {
          statSync: () => ({ isDirectory: () => true }),
          accessSync: () => {
            throw new Error('simulated access denied')
          },
        },
      })).rejects.toThrow('readable directory')
      expect(existsSync(join(target, '.drift'))).toBe(false)
    })

    it('preserves an existing destination when analysis fails before writing', async () => {
      const dir = createTempDir('drift-cli-context-analysis-failure-')
      tempDirs.push(dir)
      const outputPath = join(dir, '.drift', 'context.md')
      mkdirSync(join(dir, '.drift'), { recursive: true })
      const original = 'existing context\n'
      writeFileSync(outputPath, original)

      await expect(generateContextFile(dir, outputPath, {}, {
        analyzeProject: () => {
          throw new Error('simulated analysis failure')
        },
      })).rejects.toThrow('simulated analysis failure')
      expect(readFileSync(outputPath, 'utf8')).toBe(original)
      expect(fs.readdirSync(join(dir, '.drift'))).toEqual(['context.md'])
    })
  })

  describe('runWatch', () => {
    it('does not regenerate again when its own atomic output artifacts change', async () => {
      const dir = createTempDir('drift-context-watch-output-')
      tempDirs.push(dir)
      const outputPath = join(dir, '.drift', 'context.md')
      mkdirSync(join(dir, '.drift'), { recursive: true })
      let generations = 0
      const watcher = runWatch(dir, async () => {
        generations += 1
        const doc = buildContextDocument(dir, buildMockReport(), buildMockAIOutput())
        writeContextFile(outputPath, doc)
      }, 50, outputPath)

      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      await vi.waitFor(() => expect(generations).toBe(1), { timeout: 2000 })
      await new Promise((resolve) => setTimeout(resolve, 500))
      watcher.close()

      expect(generations).toBe(1)
    })
  })
})
