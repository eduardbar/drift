import { mkdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeProject } from './analyzer.js'
import { loadConfig } from './config.js'
import { buildReport } from './reporter.js'
import { generateReview } from './review.js'
import { buildTrustReport } from './trust.js'
import { cleanupTempDir, extractFilesAtRef } from './git.js'
import { computeDiff } from './diff.js'

interface BenchmarkOptions {
  scanPath: string
  reviewPath: string
  trustPath: string
  baseRef: string
  warmupRuns: number
  measuredRuns: number
  jsonOut?: string
}

interface TaskResult {
  name: 'scan' | 'review' | 'trust'
  warmupRuns: number
  measuredRuns: number
  samplesMs: number[]
  medianMs: number
  meanMs: number
  minMs: number
  maxMs: number
}

interface BenchmarkOutput {
  meta: {
    scannedAt: string
    node: string
    platform: NodeJS.Platform
    cwd: string
  }
  options: BenchmarkOptions
  results: TaskResult[]
}

const DEFAULT_SCAN_PATH = '.'
const DEFAULT_REVIEW_PATH = '.'
const DEFAULT_TRUST_PATH = '.'
const DEFAULT_BASE_REF = 'HEAD~1'
const DEFAULT_WARMUP_RUNS = 1
const DEFAULT_MEASURED_RUNS = 5

const TABLE_WIDTHS = {
  task: 10,
  warmup: 8,
  runs: 6,
  median: 13,
  mean: 11,
  min: 10,
  max: 10,
} as const

const TABLE_COLUMNS = [
  { key: 'task', header: 'task' },
  { key: 'warmup', header: 'warmup' },
  { key: 'runs', header: 'runs' },
  { key: 'median', header: 'median(ms)' },
  { key: 'mean', header: 'mean(ms)' },
  { key: 'min', header: 'min(ms)' },
  { key: 'max', header: 'max(ms)' },
] as const

function parseNumberFlag(value: string, flagName: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative number, received '${value}'`)
  }
  return Math.floor(parsed)
}

function parseOptions(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    scanPath: DEFAULT_SCAN_PATH,
    reviewPath: DEFAULT_REVIEW_PATH,
    trustPath: DEFAULT_TRUST_PATH,
    baseRef: DEFAULT_BASE_REF,
    warmupRuns: DEFAULT_WARMUP_RUNS,
    measuredRuns: DEFAULT_MEASURED_RUNS,
  }

  const handlers: Record<string, (value: string) => void> = {
    '--scan-path': (value) => { options.scanPath = value },
    '--review-path': (value) => { options.reviewPath = value },
    '--trust-path': (value) => { options.trustPath = value },
    '--base': (value) => { options.baseRef = value },
    '--warmup': (value) => { options.warmupRuns = parseNumberFlag(value, '--warmup') },
    '--runs': (value) => { options.measuredRuns = parseNumberFlag(value, '--runs') },
    '--json-out': (value) => { options.jsonOut = value },
  }

  for (let i = 0; i < argv.length; i += 2) {
    const arg = argv[i]
    const next = argv[i + 1]
    const handler = handlers[arg]

    if (!handler || !next) throw new Error(`Unknown or incomplete argument: ${arg}`)
    handler(next)
  }

  if (options.measuredRuns < 1) {
    throw new Error('--runs must be at least 1')
  }

  return {
    ...options,
    scanPath: path.resolve(options.scanPath),
    reviewPath: path.resolve(options.reviewPath),
    trustPath: path.resolve(options.trustPath),
    jsonOut: options.jsonOut ? path.resolve(options.jsonOut) : undefined,
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function formatMs(ms: number): string {
  return ms.toFixed(2)
}

async function runTask(
  name: TaskResult['name'],
  warmupRuns: number,
  measuredRuns: number,
  task: () => Promise<void>,
): Promise<TaskResult> {
  for (let i = 0; i < warmupRuns; i += 1) {
    await task()
  }

  const samplesMs: number[] = []
  for (let i = 0; i < measuredRuns; i += 1) {
    const started = performance.now()
    await task()
    samplesMs.push(performance.now() - started)
  }

  const total = samplesMs.reduce((sum, sample) => sum + sample, 0)
  return {
    name,
    warmupRuns,
    measuredRuns,
    samplesMs,
    medianMs: median(samplesMs),
    meanMs: total / samplesMs.length,
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
  }
}

function printTable(results: TaskResult[]): void {
  const headers = TABLE_COLUMNS.map((column) => column.header)
  const widths = TABLE_COLUMNS.map((column) => TABLE_WIDTHS[column.key])

  const row = (values: string[]): string => values
    .map((value, index) => value.padEnd(widths[index], ' '))
    .join(' ')

  process.stdout.write('\n')
  process.stdout.write(row(headers) + '\n')
  process.stdout.write(row(widths.map((width) => '-'.repeat(width))) + '\n')

  for (const result of results) {
    process.stdout.write(row([
      result.name,
      String(result.warmupRuns),
      String(result.measuredRuns),
      formatMs(result.medianMs),
      formatMs(result.meanMs),
      formatMs(result.minMs),
      formatMs(result.maxMs),
    ]) + '\n')
  }
}

async function runScan(scanPath: string): Promise<void> {
  const config = await loadConfig(scanPath)
  const files = analyzeProject(scanPath, config)
  buildReport(scanPath, files)
}

async function runTrust(trustPath: string, baseRef: string): Promise<void> {
  const config = await loadConfig(trustPath)
  const files = analyzeProject(trustPath, config)
  const report = buildReport(trustPath, files)

  let tempDir: string | undefined
  let diff

  try {
    tempDir = extractFilesAtRef(trustPath, baseRef)
    const baseFiles = analyzeProject(tempDir, config)
    const baseReport = buildReport(tempDir, baseFiles)
    diff = computeDiff(baseReport, report, baseRef)
  } catch {
    diff = undefined
  } finally {
    if (tempDir) cleanupTempDir(tempDir)
  }

  buildTrustReport(report, { diff })
}

async function runReview(reviewPath: string, baseRef: string): Promise<void> {
  await generateReview(reviewPath, baseRef)
}

async function main(argv: string[]): Promise<void> {
  const options = parseOptions(argv)

  const results = [
    await runTask('scan', options.warmupRuns, options.measuredRuns, () => runScan(options.scanPath)),
    await runTask('review', options.warmupRuns, options.measuredRuns, () => runReview(options.reviewPath, options.baseRef)),
    await runTask('trust', options.warmupRuns, options.measuredRuns, () => runTrust(options.trustPath, options.baseRef)),
  ]

  const output: BenchmarkOutput = {
    meta: {
      scannedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      cwd: process.cwd(),
    },
    options,
    results,
  }

  printTable(results)
  process.stdout.write(`\n${JSON.stringify(output, null, 2)}\n`)

  if (options.jsonOut) {
    mkdirSync(path.dirname(options.jsonOut), { recursive: true })
    writeFileSync(options.jsonOut, JSON.stringify(output, null, 2) + '\n', 'utf8')
    process.stdout.write(`\nSaved benchmark JSON to ${options.jsonOut}\n`)
  }
}

function isExecutedAsEntryPoint(): boolean {
  const entryArg = process.argv[1]
  if (!entryArg) return false
  return import.meta.url === pathToFileURL(path.resolve(entryArg)).href
}

export async function runBenchmarkCli(argv = process.argv.slice(2)): Promise<void> {
  try {
    await main(argv)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

if (isExecutedAsEntryPoint()) {
  void runBenchmarkCli()
}
