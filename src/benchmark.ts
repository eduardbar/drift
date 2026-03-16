import { mkdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
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

function parseNumberFlag(value: string, flagName: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative number, received '${value}'`)
  }
  return Math.floor(parsed)
}

function parseOptions(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    scanPath: '.',
    reviewPath: '.',
    trustPath: '.',
    baseRef: 'HEAD~1',
    warmupRuns: 1,
    measuredRuns: 5,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--scan-path' && next) {
      options.scanPath = next
      i += 1
      continue
    }
    if (arg === '--review-path' && next) {
      options.reviewPath = next
      i += 1
      continue
    }
    if (arg === '--trust-path' && next) {
      options.trustPath = next
      i += 1
      continue
    }
    if (arg === '--base' && next) {
      options.baseRef = next
      i += 1
      continue
    }
    if (arg === '--warmup' && next) {
      options.warmupRuns = parseNumberFlag(next, '--warmup')
      i += 1
      continue
    }
    if (arg === '--runs' && next) {
      options.measuredRuns = parseNumberFlag(next, '--runs')
      i += 1
      continue
    }
    if (arg === '--json-out' && next) {
      options.jsonOut = next
      i += 1
      continue
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`)
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
  const headers = ['task', 'warmup', 'runs', 'median(ms)', 'mean(ms)', 'min(ms)', 'max(ms)']
  const widths = [10, 8, 6, 13, 11, 10, 10]

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

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))

  const results = [
    await runTask('scan', options.warmupRuns, options.measuredRuns, () => runScan(options.scanPath)),
    await runTask('review', options.warmupRuns, options.measuredRuns, () => generateReview(options.reviewPath, options.baseRef).then(() => undefined)),
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
