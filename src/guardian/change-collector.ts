import { execFileSync } from 'node:child_process'
import { parseUnifiedDiff, readDiffFile } from '../ai-guard-diff.js'
import { readDiffFromBase, readStagedDiff } from '../git.js'
import type { DiffSource, UnifiedDiffEntry } from '../types/ai-guard.js'
import type { GuardianChange } from './types.js'

export interface ChangeCollectionOptions { includeHunks?: boolean }

function toChange(entry: UnifiedDiffEntry, includeHunks: boolean): GuardianChange {
  let additions = 0
  let deletions = 0
  for (const hunk of entry.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
      if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
    }
  }
  return {
    status: entry.status,
    oldPath: entry.oldPath,
    newPath: entry.newPath,
    additions,
    deletions,
    changedLines: additions + deletions,
    hunks: includeHunks ? entry.hunks : [],
  }
}

export function changesFromDiff(diff: string, options: ChangeCollectionOptions = {}): GuardianChange[] {
  const includeHunks = options.includeHunks ?? true
  return parseUnifiedDiff(diff).map(entry => toChange(entry, includeHunks))
}

export function collectChanges(projectPath: string, source: DiffSource, options?: ChangeCollectionOptions): GuardianChange[] {
  let diff: string
  switch (source.kind) {
    case 'stdin': diff = source.content; break
    case 'staged': diff = readStagedDiff(projectPath); break
    case 'file': diff = readDiffFile(projectPath, source.path); break
    case 'base': diff = readDiffFromBase(projectPath, source.ref); break
  }
  return changesFromDiff(diff, options)
}

function verifyRepository(projectPath: string): void {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: projectPath, stdio: 'pipe' })
  } catch {
    throw new Error(`Not a git repository: ${projectPath}`)
  }
}

function readWorkingTreeDiff(projectPath: string): string {
  verifyRepository(projectPath)
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: projectPath, stdio: 'pipe' })
  } catch {
    return ''
  }
  return execFileSync('git', ['diff', 'HEAD', '--no-color'], { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' })
}

export function collectWorkingTreeChanges(projectPath: string, options?: ChangeCollectionOptions): GuardianChange[] {
  return changesFromDiff(readWorkingTreeDiff(projectPath), options)
}

export function affectedFiles(changes: GuardianChange[]): string[] {
  return [...new Set(changes.map(change => change.newPath ?? change.oldPath).filter((path): path is string => path !== undefined))].sort()
}
