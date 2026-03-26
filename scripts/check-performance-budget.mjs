import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const BUDGET_SCHEMA_VERSION = 'drift-perf-budget/v1'
const BENCHMARK_RESULT_SCHEMA = 'drift-perf-check-result/v1'
const DEFAULT_BUDGET_PATH = 'benchmarks/perf-budget.v1.json'
const DEFAULT_RESULT_PATH = '.drift-perf/benchmark-latest.json'
const TASK_IDS = ['scan', 'review', 'trust']

function runGit(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  })
}

function parseArgs(argv) {
  const parsed = {
    budgetPath: DEFAULT_BUDGET_PATH,
    resultPath: DEFAULT_RESULT_PATH,
    benchmarkResultPath: undefined,
  }

  let index = 0
  while (index < argv.length) {
    const token = argv[index]
    if (token === '--budget') {
      const next = argv[index + 1]
      if (!next) throw new Error('--budget requires a value')
      parsed.budgetPath = next
      index += 2
      continue
    }

    if (token === '--out') {
      const next = argv[index + 1]
      if (!next) throw new Error('--out requires a value')
      parsed.resultPath = next
      index += 2
      continue
    }

    if (token === '--result') {
      const next = argv[index + 1]
      if (!next) throw new Error('--result requires a value')
      parsed.benchmarkResultPath = next
      index += 2
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  return parsed
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function asNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`)
  }
  return value
}

function validateBudgetSchema(budget) {
  if (budget?.schemaVersion !== BUDGET_SCHEMA_VERSION) {
    throw new Error(`Unsupported budget schemaVersion. Expected '${BUDGET_SCHEMA_VERSION}'`)
  }

  for (const taskId of TASK_IDS) {
    const taskBudget = budget?.tasks?.[taskId]
    if (!taskBudget) {
      throw new Error(`Missing budget entry for task '${taskId}'`)
    }
    asNonNegativeNumber(taskBudget.maxMedianMs, `tasks.${taskId}.maxMedianMs`)
    asNonNegativeNumber(taskBudget.maxRssMb, `tasks.${taskId}.maxRssMb`)
  }

  asNonNegativeNumber(budget?.tolerance?.runtimePct ?? 0, 'tolerance.runtimePct')
  asNonNegativeNumber(budget?.tolerance?.memoryPct ?? 0, 'tolerance.memoryPct')

  asNonNegativeNumber(budget?.benchmark?.warmupRuns, 'benchmark.warmupRuns')
  const measuredRuns = asNonNegativeNumber(budget?.benchmark?.measuredRuns, 'benchmark.measuredRuns')
  if (measuredRuns < 1) {
    throw new Error('benchmark.measuredRuns must be at least 1')
  }
}

function benchmarkTaskMap(benchmarkResult) {
  const map = new Map()
  for (const taskResult of benchmarkResult?.results ?? []) {
    map.set(taskResult.name, taskResult)
  }
  return map
}

export function evaluatePerformanceBudget(budget, benchmarkResult) {
  validateBudgetSchema(budget)

  const runtimeToleranceFactor = 1 + ((budget?.tolerance?.runtimePct ?? 0) / 100)
  const memoryToleranceFactor = 1 + ((budget?.tolerance?.memoryPct ?? 0) / 100)
  const byTask = benchmarkTaskMap(benchmarkResult)
  const failures = []
  const checks = []

  for (const taskId of TASK_IDS) {
    const taskBudget = budget.tasks[taskId]
    const measured = byTask.get(taskId)
    if (!measured) {
      failures.push(`Benchmark output is missing task '${taskId}'`)
      continue
    }

    const medianMs = asNonNegativeNumber(measured.medianMs, `results.${taskId}.medianMs`)
    const maxRssMb = asNonNegativeNumber(measured.maxRssMb, `results.${taskId}.maxRssMb`)
    const allowedMedianMs = taskBudget.maxMedianMs * runtimeToleranceFactor
    const allowedMaxRssMb = taskBudget.maxRssMb * memoryToleranceFactor

    const runtimePassed = medianMs <= allowedMedianMs
    const memoryPassed = maxRssMb <= allowedMaxRssMb

    checks.push({
      task: taskId,
      measured: { medianMs, maxRssMb },
      budget: {
        maxMedianMs: taskBudget.maxMedianMs,
        maxRssMb: taskBudget.maxRssMb,
        allowedMedianMs,
        allowedMaxRssMb,
      },
      passed: runtimePassed && memoryPassed,
      runtimePassed,
      memoryPassed,
    })

    if (!runtimePassed) {
      failures.push(
        `${taskId}: median runtime ${medianMs.toFixed(2)}ms exceeds allowed ${allowedMedianMs.toFixed(2)}ms (budget ${taskBudget.maxMedianMs}ms + tolerance ${budget.tolerance.runtimePct}%)`,
      )
    }

    if (!memoryPassed) {
      failures.push(
        `${taskId}: max RSS ${maxRssMb.toFixed(2)}MB exceeds allowed ${allowedMaxRssMb.toFixed(2)}MB (budget ${taskBudget.maxRssMb}MB + tolerance ${budget.tolerance.memoryPct}%)`,
      )
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checks,
  }
}

function createBenchmarkArgs(rootDir, budgetPath, budget, outputPath) {
  const tsxLoaderPath = resolve(rootDir, 'node_modules', 'tsx', 'dist', 'loader.mjs')
  if (!existsSync(tsxLoaderPath)) {
    throw new Error(`Missing tsx loader at ${tsxLoaderPath}. Run npm ci first.`)
  }

  const benchmarkEntry = resolve(rootDir, 'src', 'benchmark.ts')
  const tsxLoaderSpecifier = pathToFileURL(tsxLoaderPath).href

  const benchmark = resolveBenchmarkContext(rootDir, budget)
  const args = [
    '--import',
    tsxLoaderSpecifier,
    benchmarkEntry,
    '--scan-path',
    benchmark.scanPath,
    '--review-path',
    benchmark.reviewPath,
    '--trust-path',
    benchmark.trustPath,
    '--base',
    String(benchmark.baseRef),
    '--warmup',
    String(benchmark.warmupRuns),
    '--runs',
    String(benchmark.measuredRuns),
    '--json-out',
    outputPath,
  ]

  return {
    budgetPath,
    benchmarkEntry,
    args,
    cleanup: benchmark.cleanup,
  }
}

function createCommittedFixtureRepo(rootDir, fixturePath) {
  const resolvedFixturePath = resolve(rootDir, fixturePath)
  if (!existsSync(resolvedFixturePath)) {
    throw new Error(`Benchmark fixture path does not exist: ${resolvedFixturePath}`)
  }

  const tempRepo = mkdtempSync(join(tmpdir(), 'drift-perf-fixture-'))
  cpSync(resolvedFixturePath, tempRepo, { recursive: true })

  const init = runGit(tempRepo, ['init'])
  if (init.status !== 0) {
    throw new Error(`Failed to initialize git fixture repository: ${init.stderr ?? ''}`)
  }

  const add = runGit(tempRepo, ['add', '.'])
  if (add.status !== 0) {
    throw new Error(`Failed to stage git fixture files: ${add.stderr ?? ''}`)
  }

  const commit = runGit(tempRepo, [
    '-c',
    'user.name=drift-ci',
    '-c',
    'user.email=drift-ci@example.com',
    'commit',
    '-m',
    'fixture baseline',
  ])

  if (commit.status !== 0) {
    throw new Error(`Failed to commit git fixture baseline: ${commit.stderr ?? ''}`)
  }

  return {
    repoPath: tempRepo,
    cleanup: () => {
      rmSync(tempRepo, { recursive: true, force: true })
    },
  }
}

function resolveBenchmarkContext(rootDir, budget) {
  const benchmark = budget?.benchmark ?? {}
  const warmupRuns = benchmark.warmupRuns
  const measuredRuns = benchmark.measuredRuns

  if (typeof benchmark.fixturePath === 'string' && benchmark.fixturePath.trim().length > 0) {
    const fixtureRepo = createCommittedFixtureRepo(rootDir, benchmark.fixturePath)
    return {
      scanPath: fixtureRepo.repoPath,
      reviewPath: fixtureRepo.repoPath,
      trustPath: fixtureRepo.repoPath,
      baseRef: 'HEAD',
      warmupRuns,
      measuredRuns,
      cleanup: fixtureRepo.cleanup,
    }
  }

  if (!benchmark.scanPath || !benchmark.reviewPath || !benchmark.trustPath || !benchmark.baseRef) {
    throw new Error('benchmark must provide fixturePath or scanPath/reviewPath/trustPath/baseRef')
  }

  return {
    scanPath: resolve(rootDir, benchmark.scanPath),
    reviewPath: resolve(rootDir, benchmark.reviewPath),
    trustPath: resolve(rootDir, benchmark.trustPath),
    baseRef: benchmark.baseRef,
    warmupRuns,
    measuredRuns,
    cleanup: undefined,
  }
}

function runBenchmark(rootDir, budgetPath, budget, resultPath) {
  mkdirSync(dirname(resultPath), { recursive: true })

  const benchmark = createBenchmarkArgs(rootDir, budgetPath, budget, resultPath)
  const execution = spawnSync(process.execPath, benchmark.args, {
    cwd: rootDir,
    encoding: 'utf8',
  })

  if (benchmark.cleanup) {
    benchmark.cleanup()
  }

  if (execution.status !== 0) {
    const errorOutput = `${execution.stdout ?? ''}${execution.stderr ?? ''}`.trim()
    throw new Error(`Benchmark command failed (${benchmark.benchmarkEntry}):\n${errorOutput}`)
  }

  if (!existsSync(resultPath)) {
    throw new Error(`Benchmark did not produce expected JSON output at ${resultPath}`)
  }

  return readJson(resultPath)
}

export function runPerformanceBudgetCheck(rootDir = process.cwd(), argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv)
  const budgetPath = resolve(rootDir, parsed.budgetPath)
  const resultPath = resolve(rootDir, parsed.resultPath)
  const budget = readJson(budgetPath)

  const benchmarkResult = parsed.benchmarkResultPath
    ? readJson(resolve(rootDir, parsed.benchmarkResultPath))
    : runBenchmark(rootDir, budgetPath, budget, resultPath)

  const gateResultPath = resolve(dirname(resultPath), 'perf-gate-result.json')

  const evaluation = evaluatePerformanceBudget(budget, benchmarkResult)
  const gateResult = {
    schemaVersion: BENCHMARK_RESULT_SCHEMA,
    generatedAt: new Date().toISOString(),
    budgetFile: budgetPath,
    budgetVersion: budget.budgetVersion,
    benchmarkFile: parsed.benchmarkResultPath ? resolve(rootDir, parsed.benchmarkResultPath) : resultPath,
    ok: evaluation.ok,
    checks: evaluation.checks,
    failures: evaluation.failures,
  }

  mkdirSync(dirname(resultPath), { recursive: true })
  const gateResultSerialized = `${JSON.stringify(gateResult, null, 2)}\n`
  writeFileSync(gateResultPath, gateResultSerialized, 'utf8')

  if (!parsed.benchmarkResultPath) {
    process.stdout.write(`Performance benchmark generated: ${resultPath}\n`)
  }
  process.stdout.write(`Performance gate report: ${gateResultPath}\n`)

  process.stdout.write(`Performance budget version: ${budget.budgetVersion}\n`)
  for (const check of evaluation.checks) {
    process.stdout.write(
      `- ${check.task}: median ${check.measured.medianMs.toFixed(2)}ms (<= ${check.budget.allowedMedianMs.toFixed(2)}ms), max RSS ${check.measured.maxRssMb.toFixed(2)}MB (<= ${check.budget.allowedMaxRssMb.toFixed(2)}MB)\n`,
    )
  }

  if (!evaluation.ok) {
    process.stderr.write('Performance budget check failed:\n')
    for (const failure of evaluation.failures) {
      process.stderr.write(`- ${failure}\n`)
    }
    process.exitCode = 1
    return gateResult
  }

  process.stdout.write('Performance budget check passed.\n')
  return gateResult
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPerformanceBudgetCheck()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Performance budget check failed: ${message}\n`)
    process.exit(1)
  }
}
