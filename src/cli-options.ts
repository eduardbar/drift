import type { Command } from 'commander'
import type { DriftAnalysisOptions } from './types.js'
import type { GuardThresholds } from './guard-types.js'

export type ResourceOptionFlags = {
  lowMemory?: boolean
  chunkSize?: string
  maxFiles?: string
  maxFileSizeKb?: string
  withSemanticDuplication?: boolean
}

function parseOptionalPositiveInt(rawValue: string | undefined, flagName: string): number | undefined {
  if (rawValue == null) return undefined
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flagName} must be a non-negative integer`)
  }
  return value
}

export function resolveAnalysisOptions(options: ResourceOptionFlags): DriftAnalysisOptions {
  return {
    lowMemory: options.lowMemory,
    chunkSize: parseOptionalPositiveInt(options.chunkSize, '--chunk-size'),
    maxFiles: parseOptionalPositiveInt(options.maxFiles, '--max-files'),
    maxFileSizeKb: parseOptionalPositiveInt(options.maxFileSizeKb, '--max-file-size-kb'),
    includeSemanticDuplication: options.withSemanticDuplication ? true : undefined,
  }
}

export function addResourceOptions(command: Command): Command {
  return command
    .option('--low-memory', 'Reduce peak memory usage by chunking AST analysis')
    .option('--chunk-size <n>', 'Files per chunk in low-memory mode (default: 40)')
    .option('--max-files <n>', 'Maximum files to analyze before soft-skipping extras')
    .option('--max-file-size-kb <n>', 'Skip files above this size and report diagnostics')
    .option('--with-semantic-duplication', 'Keep semantic-duplication rule enabled in low-memory mode')
}

export function parseOptionalNumber(rawValue: string | undefined, flagName: string): number | undefined {
  if (rawValue == null) return undefined
  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    throw new Error(`${flagName} must be a valid number`)
  }
  return value
}

export function parseBySeverity(rawValue: string | undefined): GuardThresholds | undefined {
  if (rawValue == null) return undefined

  const spec = rawValue.trim()
  if (!spec) {
    throw new Error('--by-severity must not be empty. Expected format: error=0,warning=2,info=5')
  }

  const thresholds: GuardThresholds = {}
  const seen = new Set<string>()

  for (const segment of spec.split(',')) {
    const pair = segment.trim()
    if (!pair) continue

    const { key, rawThreshold } = parseSeverityEntry(pair)

    if (seen.has(key)) {
      throw new Error(`Duplicate --by-severity key '${key}'.`)
    }

    const threshold = parseSeverityThreshold(key, rawThreshold)
    thresholds[key] = threshold
    seen.add(key)
  }

  if (seen.size === 0) {
    throw new Error('--by-severity must include at least one threshold. Example: error=0,warning=2')
  }

  return thresholds
}

function parseSeverityEntry(pair: string): { key: keyof GuardThresholds; rawThreshold: string } {
  const equalIndex = pair.indexOf('=')
  if (equalIndex <= 0 || equalIndex === pair.length - 1) {
    throw new Error(`Invalid --by-severity entry '${pair}'. Expected key=value (e.g. warning=2).`)
  }

  const key = pair.slice(0, equalIndex).trim().toLowerCase()
  const rawThreshold = pair.slice(equalIndex + 1).trim()
  if (key !== 'error' && key !== 'warning' && key !== 'info') {
    throw new Error(`Invalid --by-severity key '${key}'. Allowed keys: error, warning, info.`)
  }

  return { key, rawThreshold }
}

function parseSeverityThreshold(key: keyof GuardThresholds, rawThreshold: string): number {
  const threshold = Number(rawThreshold)
  if (!Number.isFinite(threshold)) {
    throw new Error(`Invalid --by-severity value for '${key}': '${rawThreshold}'. Must be a valid number.`)
  }

  return threshold
}
