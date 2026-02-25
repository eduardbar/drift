import * as fs from 'node:fs'
import * as path from 'node:path'
import kleur from 'kleur'
import type { DriftReport } from './types.js'
import { scoreToGradeText } from './utils.js'

export interface SnapshotEntry {
  timestamp: string
  label: string
  score: number
  grade: string
  totalIssues: number
  files: number
  byRule: Record<string, number>
}

export interface SnapshotHistory {
  project: string
  snapshots: SnapshotEntry[]
}

const HISTORY_FILE = 'drift-history.json'

export function loadHistory(targetPath: string): SnapshotHistory {
  const filePath = path.join(targetPath, HISTORY_FILE)
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SnapshotHistory
  }
  return { project: targetPath, snapshots: [] }
}

export function saveSnapshot(
  targetPath: string,
  report: DriftReport,
  label?: string,
): SnapshotEntry {
  const history = loadHistory(targetPath)

  const entry: SnapshotEntry = {
    timestamp: new Date().toISOString(),
    label: label ?? '',
    score: report.totalScore,
    grade: scoreToGradeText(report.totalScore).label.toUpperCase(),
    totalIssues: report.totalIssues,
    files: report.totalFiles,
    byRule: { ...report.summary.byRule },
  }

  history.snapshots.push(entry)

  const filePath = path.join(targetPath, HISTORY_FILE)
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8')

  return entry
}

export function printHistory(history: SnapshotHistory): void {
  const { snapshots } = history

  if (snapshots.length === 0) {
    process.stdout.write('\n  No snapshots recorded yet.\n\n')
    return
  }

  process.stdout.write('\n')
  process.stdout.write(
    kleur.bold(
      `  ${'#'.padEnd(4)} ${'Date'.padEnd(26)} ${'Label'.padEnd(20)} ${'Score'.padEnd(8)} ${'Grade'.padEnd(12)} ${'Issues'.padEnd(8)} ${'Delta'}\n`,
    ),
  )
  process.stdout.write(
    `  ${'─'.repeat(4)} ${'─'.repeat(26)} ${'─'.repeat(20)} ${'─'.repeat(8)} ${'─'.repeat(12)} ${'─'.repeat(8)} ${'─'.repeat(6)}\n`,
  )

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i]
    const date = new Date(s.timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

    let deltaStr = '—'
    if (i > 0) {
      const prev = snapshots[i - 1]
      const delta = s.score - prev.score
      if (delta > 0) {
        deltaStr = kleur.red(`+${delta}`)
      } else if (delta < 0) {
        deltaStr = kleur.green(String(delta))
      } else {
        deltaStr = kleur.gray('0')
      }
    }

    const gradeColored = colorGrade(s.grade, s.score)

    process.stdout.write(
      `  ${String(i + 1).padEnd(4)} ${date.padEnd(26)} ${(s.label || '—').padEnd(20)} ${String(s.score).padEnd(8)} ${gradeColored.padEnd(12)} ${String(s.totalIssues).padEnd(8)} ${deltaStr}\n`,
    )
  }

  process.stdout.write('\n')
}

export function printSnapshotDiff(
  history: SnapshotHistory,
  currentScore: number,
): void {
  const { snapshots } = history

  if (snapshots.length === 0) {
    process.stdout.write('\n  No previous snapshot to compare against.\n\n')
    return
  }

  const last = snapshots[snapshots.length - 1]
  const delta = currentScore - last.score

  const lastDate = new Date(last.timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const lastLabel = last.label ? ` (${last.label})` : ''

  process.stdout.write('\n')
  process.stdout.write(
    `  Last snapshot: ${kleur.bold(lastDate)}${lastLabel} — score ${kleur.bold(String(last.score))}\n`,
  )
  process.stdout.write(
    `  Current score: ${kleur.bold(String(currentScore))}\n`,
  )
  process.stdout.write('\n')

  if (delta > 0) {
    process.stdout.write(
      `  Delta: ${kleur.bold().red(`+${delta}`)} — technical debt increased\n`,
    )
  } else if (delta < 0) {
    process.stdout.write(
      `  Delta: ${kleur.bold().green(String(delta))} — technical debt decreased\n`,
    )
  } else {
    process.stdout.write(
      `  Delta: ${kleur.gray('0')} — no change since last snapshot\n`,
    )
  }

  process.stdout.write('\n')
}

function colorGrade(grade: string, score: number): string {
  if (score === 0) return kleur.green(grade)
  if (score < 20) return kleur.green(grade)
  if (score < 45) return kleur.yellow(grade)
  if (score < 70) return kleur.red(grade)
  return kleur.bold().red(grade)
}
