import type { DriftIssue, DriftReport, FileReport } from './core.js'

export interface FileDiff {
  path: string
  scoreBefore: number
  scoreAfter: number
  scoreDelta: number
  newIssues: DriftIssue[]
  resolvedIssues: DriftIssue[]
}

export interface DriftDiff {
  baseRef: string
  projectPath: string
  scannedAt: string
  files: FileDiff[]
  totalScoreBefore: number
  totalScoreAfter: number
  totalDelta: number
  newIssuesCount: number
  resolvedIssuesCount: number
}

export interface HistoricalAnalysis {
  commitHash: string
  commitDate: Date
  author: string
  message: string
  files: FileReport[]
  totalScore: number
  averageScore: number
}

export interface TrendDataPoint {
  date: Date
  score: number
  fileCount: number
  avgIssuesPerFile: number
}

export interface BlameAttribution {
  author: string
  email: string
  commits: number
  linesChanged: number
  issuesIntroduced: number
  avgScoreImpact: number
}

export interface DriftTrendReport extends DriftReport {
  trend: TrendDataPoint[]
  regression: {
    slope: number
    intercept: number
    r2: number
  }
}

export interface DriftBlameReport extends DriftReport {
  blame: BlameAttribution[]
}
