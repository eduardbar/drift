import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const checkScriptPath = join(repoRoot, 'scripts/check-performance-budget.mjs')
const tempDirs: string[] = []

function runCheck(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [checkScriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

function writeFixtureFile(root: string, relativePath: string, content: string) {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function createFixture(options?: {
  schemaVersion?: string
  scanMedianMs?: number
  reviewMedianMs?: number
  trustMedianMs?: number
  measuredRuns?: number
  includeTrustResult?: boolean
}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'drift-perf-check-'))
  tempDirs.push(fixtureRoot)

  const budget = {
    schemaVersion: options?.schemaVersion ?? 'drift-perf-budget/v1',
    budgetVersion: 'test-budget',
    benchmark: {
      scanPath: 'benchmarks/fixtures/critical',
      reviewPath: 'benchmarks/fixtures/critical',
      trustPath: 'benchmarks/fixtures/critical',
      baseRef: 'HEAD',
      warmupRuns: 1,
      measuredRuns: options?.measuredRuns ?? 5,
    },
    tolerance: {
      runtimePct: 10,
      memoryPct: 10,
    },
    tasks: {
      scan: { maxMedianMs: 1000, maxRssMb: 400 },
      review: { maxMedianMs: 1200, maxRssMb: 450 },
      trust: { maxMedianMs: 1400, maxRssMb: 500 },
    },
  }

  const benchmarkResult = {
    meta: {
      scannedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      cwd: fixtureRoot,
    },
    options: budget.benchmark,
    results: [
      {
        name: 'scan',
        medianMs: options?.scanMedianMs ?? 800,
        maxRssMb: 320,
      },
      {
        name: 'review',
        medianMs: options?.reviewMedianMs ?? 900,
        maxRssMb: 360,
      },
      ...(options?.includeTrustResult === false
        ? []
        : [{
          name: 'trust',
          medianMs: options?.trustMedianMs ?? 1100,
          maxRssMb: 390,
        }]),
    ],
  }

  writeFixtureFile(fixtureRoot, 'benchmarks/perf-budget.v1.json', `${JSON.stringify(budget, null, 2)}\n`)
  writeFixtureFile(fixtureRoot, '.drift-perf/benchmark-sample.json', `${JSON.stringify(benchmarkResult, null, 2)}\n`)

  return fixtureRoot
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('performance budget checker', () => {
  it('passes when benchmark result stays within budget and tolerance', () => {
    const fixtureRoot = createFixture()

    const result = runCheck(fixtureRoot, ['--result', '.drift-perf/benchmark-sample.json'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Performance budget check passed.')
  })

  it('fails when runtime budget is exceeded', () => {
    const fixtureRoot = createFixture({ scanMedianMs: 1300 })

    const result = runCheck(fixtureRoot, ['--result', '.drift-perf/benchmark-sample.json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Performance budget check failed:')
    expect(result.stderr).toContain('scan: median runtime')
  })

  it('fails when budget schema version is invalid', () => {
    const fixtureRoot = createFixture({ schemaVersion: 'drift-perf-budget/v0' })

    const result = runCheck(fixtureRoot, ['--result', '.drift-perf/benchmark-sample.json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unsupported budget schemaVersion')
  })

  it('fails when benchmark output does not include all required tasks', () => {
    const fixtureRoot = createFixture({ includeTrustResult: false })

    const result = runCheck(fixtureRoot, ['--result', '.drift-perf/benchmark-sample.json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Benchmark output is missing task 'trust'")
  })

  it('fails when benchmark measuredRuns is invalid', () => {
    const fixtureRoot = createFixture({ measuredRuns: 0 })

    const result = runCheck(fixtureRoot, ['--result', '.drift-perf/benchmark-sample.json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('benchmark.measuredRuns must be at least 1')
  })
})
