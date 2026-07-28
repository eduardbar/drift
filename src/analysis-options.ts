import type { DriftAnalysisOptions, DriftConfig } from './types.js'

const LOW_MEMORY_DEFAULT_CHUNK_SIZE = 40
const STANDARD_DEFAULT_CHUNK_SIZE = 200
const BYTES_PER_KILOBYTE = 1024

export interface AnalyzableSource {
  path: string
  sizeBytes: number
}

interface ResolvedAnalysisOptions {
  lowMemory: boolean
  chunkSize: number
  maxFiles?: number
  maxFileSizeKb?: number
  includeSemanticDuplication: boolean
}

interface SourceSelection<T> {
  selectedPaths: string[]
  skippedReports: T[]
}

type SkipReportFactory<T> = (
  filePath: string,
  rule: 'analysis-skip-max-files' | 'analysis-skip-file-size',
  message: string,
) => T

export function resolveAnalysisOptions(config?: DriftConfig, options?: DriftAnalysisOptions): ResolvedAnalysisOptions {
  const performance = config?.performance
  const lowMemory = options?.lowMemory ?? performance?.lowMemory ?? false
  const chunkSize = Math.max(
    1,
    options?.chunkSize ?? performance?.chunkSize ?? (lowMemory ? LOW_MEMORY_DEFAULT_CHUNK_SIZE : STANDARD_DEFAULT_CHUNK_SIZE),
  )
  const includeSemanticDuplication = options?.includeSemanticDuplication
    ?? performance?.includeSemanticDuplication
    ?? !lowMemory

  return {
    lowMemory,
    chunkSize,
    maxFiles: options?.maxFiles ?? performance?.maxFiles,
    maxFileSizeKb: options?.maxFileSizeKb ?? performance?.maxFileSizeKb,
    includeSemanticDuplication,
  }
}

export function chunkPaths(paths: string[], chunkSize: number): string[][] {
  if (paths.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += chunkSize) {
    chunks.push(paths.slice(i, i + chunkSize))
  }
  return chunks
}

export function selectSourcesForAnalysis<T>(
  sources: AnalyzableSource[],
  options: ResolvedAnalysisOptions,
  createSkipReport: SkipReportFactory<T>,
): SourceSelection<T> {
  let selected = sources
  const skippedReports: T[] = []

  if (typeof options.maxFiles === 'number' && options.maxFiles >= 0 && selected.length > options.maxFiles) {
    const allowed = selected.slice(0, options.maxFiles)
    const skipped = selected.slice(options.maxFiles)
    selected = allowed

    for (const source of skipped) {
      skippedReports.push(createSkipReport(
        source.path,
        'analysis-skip-max-files',
        `Skipped by maxFiles guardrail (${options.maxFiles})`,
      ))
    }
  }

  if (typeof options.maxFileSizeKb === 'number' && options.maxFileSizeKb > 0) {
    const maxBytes = options.maxFileSizeKb * BYTES_PER_KILOBYTE
    const keep: AnalyzableSource[] = []
    for (const source of selected) {
      if (source.sizeBytes > maxBytes) {
        const fileSizeKb = Math.ceil(source.sizeBytes / BYTES_PER_KILOBYTE)
        skippedReports.push(createSkipReport(
          source.path,
          'analysis-skip-file-size',
          `Skipped by maxFileSizeKb guardrail (${fileSizeKb}KB > ${options.maxFileSizeKb}KB)`,
        ))
      } else {
        keep.push(source)
      }
    }
    selected = keep
  }

  return {
    selectedPaths: selected.map((source) => source.path),
    skippedReports,
  }
}
