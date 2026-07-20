// drift-ignore-file
import type { DriftIssue, FileReport } from './core.js'

export type DiffSource =
  | { kind: 'stdin'; content: string }
  | { kind: 'staged' }
  | { kind: 'file'; path: string }
  | { kind: 'base'; ref: string }

export type DiffEntryStatus = 'added' | 'modified' | 'deleted' | 'rename' | 'binary'

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
}

export interface UnifiedDiffEntry {
  oldPath?: string
  newPath?: string
  status: DiffEntryStatus
  hunks: DiffHunk[]
}

export interface AIGuardIssue {
  rule: string
  severity: string
  file?: string
  line?: number
  message?: string
}

export interface AIGuardResult {
  passed: boolean
  source: DiffSource['kind']
  scoreBefore: number
  scoreAfter: number
  scoreDelta: number
  newIssues: AIGuardIssue[]
  resolvedIssues: AIGuardIssue[]
  issues: AIGuardIssue[]
  files: string[]
  reason?: string
  suggestions?: Array<AIGuardIssue & { suggestion: string }>
}

export interface AIGuardOptions {
  projectPath: string
  source: DiffSource
  budget?: number
  blockOn?: string[]
  suggestions?: boolean
  analysisOptions?: Record<string, unknown>
}

export type GuardFileReports = Pick<FileReport, 'path' | 'score' | 'issues'>[]
export type GuardDiffIssues = Pick<DriftIssue, 'rule' | 'severity' | 'message' | 'line'>[]
