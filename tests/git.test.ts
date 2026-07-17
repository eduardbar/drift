import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDiffFromBase, readStagedDiff } from '../src/git.js'

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
}

function commitAll(dir: string, message: string): void {
  execSync('git add -A', { cwd: dir, stdio: 'pipe' })
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'pipe' })
}

describe('git diff readers', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  describe('readStagedDiff', () => {
    it('returns empty string when nothing is staged', () => {
      const dir = createTempDir('drift-git-staged-empty-')
      tempDirs.push(dir)
      initGitRepo(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')

      expect(readStagedDiff(dir)).toBe('')
    })

    it('returns unified diff for staged changes', () => {
      const dir = createTempDir('drift-git-staged-')
      tempDirs.push(dir)
      initGitRepo(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      commitAll(dir, 'initial')
      writeFileSync(join(dir, 'a.ts'), 'export const a = 2\n')
      execSync('git add a.ts', { cwd: dir, stdio: 'pipe' })

      const diff = readStagedDiff(dir)
      expect(diff).toContain('diff --git')
      expect(diff).toContain('-export const a = 1')
      expect(diff).toContain('+export const a = 2')
    })

    it('throws when project path is not a git repo', () => {
      const dir = createTempDir('drift-git-notrepo-')
      tempDirs.push(dir)

      expect(() => readStagedDiff(dir)).toThrow('Not a git repository')
    })
  })

  describe('readDiffFromBase', () => {
    it('returns unified diff between HEAD and base ref', () => {
      const dir = createTempDir('drift-git-base-')
      tempDirs.push(dir)
      initGitRepo(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      commitAll(dir, 'first')
      execSync('git tag v1', { cwd: dir, stdio: 'pipe' })
      writeFileSync(join(dir, 'a.ts'), 'export const a = 2\n')
      commitAll(dir, 'second')

      const diff = readDiffFromBase(dir, 'v1')
      expect(diff).toContain('diff --git')
      expect(diff).toContain('-export const a = 1')
      expect(diff).toContain('+export const a = 2')
    })

    it('throws when base ref is invalid', () => {
      const dir = createTempDir('drift-git-base-invalid-')
      tempDirs.push(dir)
      initGitRepo(dir)
      writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
      commitAll(dir, 'initial')

      expect(() => readDiffFromBase(dir, 'nonexistent-ref')).toThrow('Invalid git ref')
    })

    it('throws when project path is not a git repo', () => {
      const dir = createTempDir('drift-git-base-notrepo-')
      tempDirs.push(dir)

      expect(() => readDiffFromBase(dir, 'HEAD')).toThrow('Not a git repository')
    })
  })
})
