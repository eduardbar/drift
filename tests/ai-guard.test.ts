import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  selectDiffSource,
  runAIGuard,
} from '../src/ai-guard.js'
import { applyDiffToTempDir, parseUnifiedDiff } from '../src/ai-guard-diff.js'
import { computeAIGuardResult, enforceBlockOn, enforceBudget } from '../src/ai-guard-results.js'

describe('ai guard diff engine', () => {
  it('parses additions, deletions, and renames from a unified diff', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 100%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      'diff --git a/src/file.ts b/src/file.ts',
      '--- a/src/file.ts',
      '+++ b/src/file.ts',
      '@@ -1,1 +1,2 @@',
      ' const value = 1',
      '+const next = 2',
    ].join('\n')

    const result = parseUnifiedDiff(diff)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ status: 'rename', oldPath: 'src/old.ts', newPath: 'src/new.ts' })
    expect(result[1].hunks[0].lines).toContain('+const next = 2')
  })

  it('rejects traversal and absolute paths before applying a patch', () => {
    expect(() => parseUnifiedDiff('--- a/../escape.ts\n+++ b/escape.ts\n@@ -0,0 +1 @@\n+bad')).toThrow(/unsafe|traversal/i)
    expect(() => parseUnifiedDiff('--- C:/escape.ts\n+++ b/escape.ts\n@@ -0,0 +1 @@\n+bad')).toThrow(/unsafe|absolute|drive/i)
    expect(() => parseUnifiedDiff('diff --git a/safe.ts b/../escape.ts\n--- a/safe.ts\n+++ b/../escape.ts\n@@ -1 +1 @@\n-old\n+new')).toThrow(/unsafe|traversal/i)
  })

  it('rejects symlink and junction ancestors for writes and renames', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'drift-ai-guard-link-'))
    const outside = mkdtempSync(join(tmpdir(), 'drift-ai-guard-outside-'))
    mkdirSync(join(workspace, 'safe')); writeFileSync(join(outside, 'value.ts'), 'export const value = 1\n')
    symlinkSync(outside, join(workspace, 'safe', 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    const patch = parseUnifiedDiff('--- a/safe/link/value.ts\n+++ b/safe/link/value.ts\n@@ -1 +1 @@\n-export const value = 1\n+export const value = 2')
    expect(() => applyDiffToTempDir(workspace, patch)).toThrow(/symlink|junction/i)
    const rename = parseUnifiedDiff('diff --git a/safe/link/value.ts b/renamed.ts\nsimilarity index 100%\nrename from safe/link/value.ts\nrename to renamed.ts')
    expect(() => applyDiffToTempDir(workspace, rename)).toThrow(/symlink|junction/i)
    expect(readFileSync(join(outside, 'value.ts'), 'utf8')).toBe('export const value = 1\n')
    rmSync(workspace, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true })
  })

  it('applies a content patch inside the supplied workspace only', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'drift-ai-guard-test-'))
    const sourceFile = join(workspace, 'src', 'file.ts')
    mkdirSync(join(workspace, 'src'), { recursive: true })
    writeFileSync(sourceFile, 'const value = 1\n')
    try {
      const patch = parseUnifiedDiff('--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1,2 @@\n const value = 1\n+const next = 2')
      applyDiffToTempDir(workspace, patch)
      expect(readFileSync(sourceFile, 'utf8')).toBe('const value = 1\nconst next = 2\n')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('computes score delta and identifies new and resolved issues', () => {
    const before = [{ path: 'a.ts', score: 90, issues: [{ rule: 'x', severity: 'warning', message: 'x', line: 1, column: 1, snippet: '' }] }]
    const after = [{ path: 'a.ts', score: 70, issues: [{ rule: 'y', severity: 'error', message: 'y', line: 2, column: 1, snippet: '' }] }]
    const result = computeAIGuardResult(before, after)
    expect(result).toMatchObject({ scoreDelta: -20 })
    expect(result.newIssues.map(issue => issue.rule)).toEqual(['y'])
    expect(result.resolvedIssues.map(issue => issue.rule)).toEqual(['x'])
  })

  it('compares project-relative identities without treating unchanged findings as new and resolved', () => {
    const result = computeAIGuardResult(
      [{ path: 'C:/tmp/before/src/value.ts', score: 90, issues: [{ rule: 'debug-leftover', severity: 'warning', message: 'Remove console.log', line: 2, column: 1, snippet: '' }] }],
      [{ path: 'C:/tmp/after/src/value.ts', score: 90, issues: [{ rule: 'debug-leftover', severity: 'warning', message: 'Remove console.log', line: 2, column: 1, snippet: '' }] }],
      { before: 'C:/tmp/before', after: 'C:/tmp/after' },
    )
    expect(result.newIssues).toEqual([])
    expect(result.resolvedIssues).toEqual([])
    expect(result.issues[0].file).toBe('src/value.ts')
  })

  it('enforces score budgets and block-on rules deterministically', () => {
    expect(enforceBudget(8, 10)).toEqual({ passed: true, reason: undefined })
    expect(enforceBudget(12, 10)).toMatchObject({ passed: false })
    expect(enforceBlockOn([{ rule: 'x', severity: 'error' }], ['error'])).toMatchObject({ passed: false })
    expect(enforceBlockOn([{ rule: 'x', severity: 'warning' }], ['error'])).toMatchObject({ passed: true })
  })

  it('requires one and only one diff source', () => {
    expect(selectDiffSource({ stdin: true }, 'patch')).toEqual({ kind: 'stdin', content: 'patch' })
    expect(() => selectDiffSource({})).toThrow(/exactly one/i)
    expect(() => selectDiffSource({ staged: true, base: 'HEAD' })).toThrow(/exactly one/i)
  })

  it('runs an isolated stdin guard and removes temporary roots on failure', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'drift-ai-guard-fixture-'))
    mkdirSync(join(projectPath, 'src'))
    writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\n')
    const before = readdirSync(tmpdir()).filter(name => name.startsWith('drift-ai-guard-'))
    const result = await runAIGuard({
      projectPath,
      source: { kind: 'stdin', content: '--- a/src/value.ts\n+++ b/src/value.ts\n@@ -1 +1 @@\n-export const value = 1\n+export const value = 2\n' },
    })
    expect(result.source).toBe('stdin')
    expect(result.scoreDelta).toBe(0)
    expect(readdirSync(tmpdir()).filter(name => name.startsWith('drift-ai-guard-'))).toEqual(before)
    await expect(runAIGuard({ projectPath, source: { kind: 'stdin', content: 'not a diff' } })).rejects.toThrow(/malformed/i)
    expect(readdirSync(tmpdir()).filter(name => name.startsWith('drift-ai-guard-'))).toEqual(before)
    rmSync(projectPath, { recursive: true, force: true })
  })

  it('materializes HEAD as the staged baseline and applies the staged diff once', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'drift-ai-guard-git-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: projectPath, stdio: 'pipe', encoding: 'utf8' })
    try {
      git('init', '-q')
      git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
      mkdirSync(join(projectPath, 'src')); writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\n')
      git('add', '.'); git('commit', '-qm', 'initial')
      writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\nconsole.log(value)\n')
      git('add', '.')
      const result = await runAIGuard({ projectPath, source: { kind: 'staged' } })
      expect(result.source).toBe('staged')
      expect(result.newIssues.some(issue => issue.file === 'src/value.ts')).toBe(true)
      expect(result.newIssues.every(issue => !issue.file?.includes('drift-ai-guard-'))).toBe(true)
    } finally {
      rmSync(projectPath, { recursive: true, force: true })
    }
  }, 30000)

  it('materializes a base ref and applies the working-tree diff once', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'drift-ai-guard-base-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: projectPath, stdio: 'pipe', encoding: 'utf8' })
    try {
      git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
      mkdirSync(join(projectPath, 'src')); writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\n')
      git('add', '.'); git('commit', '-qm', 'initial')
      writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\nconsole.log(value)\n')
      const result = await runAIGuard({ projectPath, source: { kind: 'base', ref: 'HEAD' } })
      expect(result.source).toBe('base')
      expect(result.newIssues.some(issue => issue.file === 'src/value.ts')).toBe(true)
    } finally {
      rmSync(projectPath, { recursive: true, force: true })
    }
  }, 30000)

  it('returns deterministic suggestions only when requested', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'drift-ai-guard-suggest-'))
    mkdirSync(join(projectPath, 'src')); writeFileSync(join(projectPath, 'src', 'value.ts'), 'export const value = 1\n')
    const result = await runAIGuard({ projectPath, suggestions: true, source: { kind: 'stdin', content: '--- a/src/value.ts\n+++ b/src/value.ts\n@@ -1 +2 @@\n export const value = 1\n+console.log(value)' } })
    expect(result.suggestions?.[0]).toMatchObject({ file: 'src/value.ts', rule: 'debug-leftover' })
    expect(JSON.stringify(result)).not.toContain(projectPath)
    expect(readFileSync(join(projectPath, 'src', 'value.ts'), 'utf8')).toBe('export const value = 1\n')
    rmSync(projectPath, { recursive: true, force: true })
  })
})
