import type { DriftIssue } from './core.js'
import type { DriftDiff } from './diff.js'

export type DiffSource =
  | { kind: 'stdin'; content: string }
  | { kind: 'file'; path: string }
  | { kind: 'staged' }
  | { kind: 'base'; ref: string }

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export interface ParsedDiffFile {
  oldPath: string
  newPath: string
  hunks: DiffHunk[]
  isDeleted: boolean
  isNew: boolean
  isRename: boolean
}

export interface ParsedDiff {
  files: ParsedDiffFile[]
}

export interface AIGuardSuggestion {
  rule: string
  file: string
  line: number
  suggestion: string
  effort: 'low' | 'medium' | 'high'
}

export interface AIGuardResult {
  scannedAt: string
  projectPath: string
  passed: boolean
  scoreDelta: number
  newIssues: DriftIssue[]
  resolvedIssues: DriftIssue[]
  warnings: string[]
  suggestions: AIGuardSuggestion[]
  diff: DriftDiff
}

export interface AIGuardOptions {
  diff?: DiffSource
  budget?: number
  blockOnRules?: string[]
  format?: 'json' | 'console'
  suggestions?: boolean
}
