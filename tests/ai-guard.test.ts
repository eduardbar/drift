// drift-ignore-file
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyDiffToTempDir,
  computeAIGuardResult,
  enforceBlockOn,
  enforceBudget,
  parseUnifiedDiff,
  selectDiffSource,
  runAIGuard,
} from '../src/ai-guard.js'

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

  it('applies a content patch inside the supplied workspace only', () => {
    const workspace = 'C:\\temp\\drift-ai-guard-test'
    mkdirSync(`${workspace}\\src`, { recursive: true })
    writeFileSync(`${workspace}\\src\\file.ts`, 'const value = 1\n')
    const patch = parseUnifiedDiff('--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1,2 @@\n const value = 1\n+const next = 2')
    expect(() => applyDiffToTempDir(workspace, patch)).not.toThrow()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('computes score delta and identifies new and resolved issues', () => {
    const before = [{ path: 'a.ts', score: 90, issues: [{ rule: 'x', severity: 'warning', message: 'x', line: 1, column: 1, snippet: '' }] }]
    const after = [{ path: 'a.ts', score: 70, issues: [{ rule: 'y', severity: 'error', message: 'y', line: 2, column: 1, snippet: '' }] }]
    const result = computeAIGuardResult(before, after)
    expect(result).toMatchObject({ scoreDelta: -20 })
    expect(result.newIssues.map(issue => issue.rule)).toEqual(['y'])
    expect(result.resolvedIssues.map(issue => issue.rule)).toEqual(['x'])
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
})
