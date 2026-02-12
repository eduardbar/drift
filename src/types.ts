export interface DriftIssue {
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
  line: number
  column: number
  snippet: string
}

export interface FileReport {
  path: string
  issues: DriftIssue[]
  score: number // 0–100, higher = more drift
}

export interface DriftReport {
  scannedAt: string
  targetPath: string
  files: FileReport[]
  totalIssues: number
  totalScore: number
  summary: {
    errors: number
    warnings: number
    infos: number
    byRule: Record<string, number>
  }
}
