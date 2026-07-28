import { describe, expect, it } from 'vitest'
import {
  chunkPaths,
  resolveAnalysisOptions,
  selectSourcesForAnalysis,
  type AnalyzableSource,
} from '../src/analysis-options.js'
import type { DriftConfig } from '../src/types.js'

describe('analysis option resolution', () => {
  it('uses explicit options before config and applies low-memory defaults', () => {
    const config: DriftConfig = {
      performance: {
        lowMemory: false,
        chunkSize: 99,
        maxFiles: 8,
        maxFileSizeKb: 12,
        includeSemanticDuplication: true,
      },
    }

    expect(resolveAnalysisOptions(config, {
      lowMemory: true,
      chunkSize: 0,
      maxFiles: 3,
      maxFileSizeKb: 4,
      includeSemanticDuplication: false,
    })).toEqual({
      lowMemory: true,
      chunkSize: 1,
      maxFiles: 3,
      maxFileSizeKb: 4,
      includeSemanticDuplication: false,
    })
  })

  it('uses configured values and disables semantic duplication for low memory by default', () => {
    expect(resolveAnalysisOptions({ performance: { lowMemory: true, chunkSize: 7 } })).toEqual({
      lowMemory: true,
      chunkSize: 7,
      maxFiles: undefined,
      maxFileSizeKb: undefined,
      includeSemanticDuplication: false,
    })
  })
})

describe('analysis path chunking', () => {
  it('preserves order while splitting paths into bounded chunks', () => {
    expect(chunkPaths(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('returns no chunks for an empty source set', () => {
    expect(chunkPaths([], 2)).toEqual([])
  })
})

describe('analysis source selection', () => {
  const sources: AnalyzableSource[] = [
    { path: 'a.ts', sizeBytes: 10 },
    { path: 'b.ts', sizeBytes: 30 },
    { path: 'c.ts', sizeBytes: 50 },
  ]
  const createSkipReport = (filePath: string, rule: string, message: string) => ({ filePath, rule, message })

  it('applies maxFiles before maxFileSizeKb and reports each skipped source', () => {
    expect(selectSourcesForAnalysis(sources, {
      lowMemory: false,
      chunkSize: 200,
      maxFiles: 2,
      maxFileSizeKb: 0.02,
      includeSemanticDuplication: true,
    }, createSkipReport)).toEqual({
      selectedPaths: ['a.ts'],
      skippedReports: [
        { filePath: 'c.ts', rule: 'analysis-skip-max-files', message: 'Skipped by maxFiles guardrail (2)' },
        { filePath: 'b.ts', rule: 'analysis-skip-file-size', message: 'Skipped by maxFileSizeKb guardrail (1KB > 0.02KB)' },
      ],
    })
  })

  it('keeps all sources when guardrails are absent', () => {
    expect(selectSourcesForAnalysis(sources, {
      lowMemory: false,
      chunkSize: 200,
      includeSemanticDuplication: true,
    }, createSkipReport)).toEqual({ selectedPaths: ['a.ts', 'b.ts', 'c.ts'], skippedReports: [] })
  })
})
