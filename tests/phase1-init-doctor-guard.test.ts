import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDoctor } from '../src/doctor.js'
import { runInit } from '../src/init.js'
import { evaluateGuard, formatGuardJson, runGuard } from '../src/guard.js'
import { analyzeProject } from '../src/analyzer.js'
import { buildReport } from '../src/reporter.js'

type JsonSchema = {
  type?: string | string[]
  required?: string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  const?: unknown
  enum?: unknown[]
}

function validateAgainstSchema(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const errors: string[] = []

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`)
    return errors
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${JSON.stringify(schema.enum)}`)
    return errors
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
    const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    if (!allowedTypes.includes(actualType)) {
      errors.push(`${path} must be type ${allowedTypes.join('|')}, got ${actualType}`)
      return errors
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      errors.push(...validateAgainstSchema(schema.items, value[i], `${path}[${i}]`))
    }
    return errors
  }

  if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>
    const required = schema.required ?? []
    const properties = schema.properties ?? {}

    for (const key of required) {
      if (!(key in objectValue)) {
        errors.push(`${path}.${key} is required`)
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in objectValue) {
        errors.push(...validateAgainstSchema(propertySchema, objectValue[key], `${path}.${key}`))
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!(key in properties)) {
          errors.push(`${path}.${key} is not allowed`)
        }
      }
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object' &&
      schema.additionalProperties !== null
    ) {
      for (const [key, propValue] of Object.entries(objectValue)) {
        if (!(key in properties)) {
          errors.push(...validateAgainstSchema(schema.additionalProperties, propValue, `${path}.${key}`))
        }
      }
    }
  }

  return errors
}

function loadSchema(schemaFileName: string): JsonSchema {
  const raw = readFileSync(join(process.cwd(), 'schemas', schemaFileName), 'utf8')
  return JSON.parse(raw) as JsonSchema
}

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('phase 1: doctor/init/guard', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  describe('runDoctor', () => {
    it('prints a basic diagnostic report and exits with code 0', async () => {
      const projectDir = createTempDir('drift-doctor-basic-')
      tempDirs.push(projectDir)
      writeFileSync(join(projectDir, 'index.ts'), 'export const value = 1\n')

      const output: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output.push(String(chunk))
        return true
      })

      const exitCode = await runDoctor(projectDir)
      const text = output.join('')

      expect(exitCode).toBe(0)
      expect(text).toContain('drift doctor')
      expect(text).toContain('Source files (.ts/.tsx/.js/.jsx): 1')
    })

    it('prints valid JSON output with expected shape', async () => {
      const projectDir = createTempDir('drift-doctor-json-')
      tempDirs.push(projectDir)
      mkdirSync(join(projectDir, 'src'))
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
      writeFileSync(join(projectDir, 'tsconfig.json'), '{"compilerOptions":{}}\n')
      writeFileSync(join(projectDir, 'drift.config.ts'), 'export default {}\n')
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'export const answer = 42\n')

      const output: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output.push(String(chunk))
        return true
      })

      await runDoctor(projectDir, { json: true })
      const report = JSON.parse(output.join('')) as {
        $schema: string
        toolVersion: string
        targetPath: string
        node: { version: string; major: number; supported: boolean }
        project: {
          packageJsonFound: boolean
          esm: boolean
          tsconfigFound: boolean
          sourceFilesCount: number
          lowMemorySuggested: boolean
          driftConfigFile: string | null
        }
      }

      const schema = loadSchema('drift-doctor.v1.json')
      const schemaErrors = validateAgainstSchema(schema, report)

      expect(report.$schema).toBe('schemas/drift-doctor.v1.json')
      expect(typeof report.toolVersion).toBe('string')
      expect(report.toolVersion.length).toBeGreaterThan(0)
      expect(report.targetPath).toBe(projectDir)
      expect(typeof report.node.version).toBe('string')
      expect(typeof report.node.major).toBe('number')
      expect(typeof report.node.supported).toBe('boolean')
      expect(report.project.packageJsonFound).toBe(true)
      expect(report.project.esm).toBe(true)
      expect(report.project.tsconfigFound).toBe(true)
      expect(report.project.sourceFilesCount).toBe(2)
      expect(report.project.driftConfigFile).toBe('drift.config.ts')
      expect(typeof report.project.lowMemorySuggested).toBe('boolean')
      expect(schemaErrors).toEqual([])
    })
  })

  describe('runInit', () => {
    it('creates drift.config.ts when using a valid preset', async () => {
      const projectDir = createTempDir('drift-init-preset-')
      tempDirs.push(projectDir)

      await runInit(projectDir, { preset: 'node-backend' })

      const generated = readFileSync(join(projectDir, 'drift.config.ts'), 'utf8')
      expect(generated).toContain('satisfies DriftConfig')
      expect(generated).toContain("name: 'api'")
    })

    it('throws on invalid preset', async () => {
      const projectDir = createTempDir('drift-init-invalid-')
      tempDirs.push(projectDir)

      await expect(runInit(projectDir, { preset: 'invalid-preset' })).rejects.toThrow("Invalid preset 'invalid-preset'")
    })

    it('creates ci workflow when --ci flag is enabled', async () => {
      const projectDir = createTempDir('drift-init-ci-')
      tempDirs.push(projectDir)

      await runInit(projectDir, { ci: true })

      const workflowPath = join(projectDir, '.github', 'workflows', 'drift-review.yml')
      const workflow = readFileSync(workflowPath, 'utf8')
      expect(workflow).toContain('name: drift PR Review')
      expect(workflow).toContain('node-version: 20')
      expect(workflow).toContain('npx drift review --base')
    })

    it('prints no-actions message when no flags are provided', async () => {
      const projectDir = createTempDir('drift-init-empty-')
      tempDirs.push(projectDir)

      const output: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output.push(String(chunk))
        return true
      })

      await runInit(projectDir, {})

      expect(output.join('')).toContain('No actions taken. Use --preset, --ci, --baseline, or --context flags.')
    })
  })

  describe('guard', () => {
    it('evaluateGuard applies no-regression, budget and severity checks', () => {
      const evaluation = evaluateGuard({
        metrics: {
          scoreDelta: 3,
          totalIssuesDelta: 1,
          severityDelta: { error: 1, warning: 0, info: 0 },
        },
        budget: 2,
        bySeverity: { error: 0, warning: 1, info: 0 },
        enforceNoRegression: {
          score: true,
          totalIssues: true,
        },
      })

      expect(evaluation.passed).toBe(false)
      expect(evaluation.checks.some((check) => check.id === 'no-regression-score' && !check.passed)).toBe(true)
      expect(evaluation.checks.some((check) => check.id === 'no-regression-total-issues' && !check.passed)).toBe(true)
      expect(evaluation.checks.some((check) => check.id === 'budget-total-delta' && !check.passed)).toBe(true)
      expect(evaluation.checks.some((check) => check.id === 'severity-error' && !check.passed)).toBe(true)
    })

    it('runs in baseline mode with inline baseline fixture', async () => {
      const projectDir = createTempDir('drift-guard-baseline-')
      tempDirs.push(projectDir)
      writeFileSync(join(projectDir, 'main.ts'), 'export const value: any = 42\n')

      const reports = analyzeProject(projectDir)
      const current = buildReport(projectDir, reports)

      const result = await runGuard(projectDir, {
        baseline: {
          score: current.totalScore,
          totalIssues: current.totalIssues,
          bySeverity: {
            error: current.summary.errors,
            warning: current.summary.warnings,
            info: current.summary.infos,
          },
        },
        budget: 0,
        bySeverity: { error: 0, warning: 0, info: 0 },
      })
      const resultJson = JSON.parse(formatGuardJson(result)) as Record<string, unknown>
      const schema = loadSchema('drift-guard.v1.json')
      const schemaErrors = validateAgainstSchema(schema, JSON.parse(JSON.stringify(resultJson)))

      expect(result.mode).toBe('baseline')
      expect(result.passed).toBe(true)
      expect(result.metrics.scoreDelta).toBe(0)
      expect(result.metrics.totalIssuesDelta).toBe(0)
      expect(result.metrics.severityDelta).toEqual({ error: 0, warning: 0, info: 0 })
      expect(result.checks.some((check) => check.id === 'no-regression-score')).toBe(true)
      expect(result.checks.some((check) => check.id === 'no-regression-total-issues')).toBe(true)
      expect(resultJson.$schema).toBe('schemas/drift-guard.v1.json')
      expect(typeof resultJson.toolVersion).toBe('string')
      expect(String(resultJson.toolVersion).length).toBeGreaterThan(0)
      expect(schemaErrors).toEqual([])
    }, 30000)

    it('throws when guard has no baseRef and no baseline', async () => {
      const projectDir = createTempDir('drift-guard-missing-anchor-')
      tempDirs.push(projectDir)
      writeFileSync(join(projectDir, 'main.ts'), 'export const value = 1\n')

      await expect(runGuard(projectDir, {})).rejects.toThrow(
        'Guard requires a comparison point: provide baseRef or a baseline (inline or file).',
      )
    })
  })
})
