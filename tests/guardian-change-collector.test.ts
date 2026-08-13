import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  affectedFiles,
  changesFromDiff,
  collectChanges,
  collectWorkingTreeChanges,
} from '../src/guardian/index.js'
import type { GuardianChange } from '../src/guardian/index.js'

const modifiedDiff = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 one
-old
+new
+extra
 tail
`
const fixtureDiff = `${modifiedDiff}diff --git a/added.ts b/added.ts
new file mode 100644
--- a/added.ts
+++ b/added.ts
@@ -0,0 +1 @@
+added
diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
--- a/deleted.ts
+++ b/deleted.ts
@@ -1 +0,0 @@
-deleted
diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
diff --git a/image.png b/image.png
index 1111111..2222222
Binary files a/image.png and b/image.png differ
`

function createTempDir(prefix: string): string { return mkdtempSync(join(tmpdir(), prefix)) }
function initGitRepo(dir: string): void {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'pipe' })
}
function commitAll(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'pipe' })
}

describe('Guardian change collector', () => {
  const tempDirs: string[] = []
  afterEach(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); tempDirs.length = 0 })

  it('maps all statuses, paths, hunk statistics, and optional hunks', () => {
    const changes = changesFromDiff(fixtureDiff)
    expect(changes.map(change => change.status)).toEqual(['modified', 'added', 'deleted', 'rename', 'binary'])
    expect(changes[0]).toMatchObject({ oldPath: 'src/a.ts', newPath: 'src/a.ts', additions: 2, deletions: 1, changedLines: 3 })
    expect(changes[1]).toMatchObject({ newPath: 'added.ts', additions: 1, deletions: 0 })
    expect(changes[2]).toMatchObject({ oldPath: 'deleted.ts', additions: 0, deletions: 1 })
    expect(changes[3]).toMatchObject({ oldPath: 'old.ts', newPath: 'new.ts', additions: 0, deletions: 0 })
    expect(changes[4]).toMatchObject({ oldPath: 'image.png', newPath: 'image.png', additions: 0, deletions: 0, changedLines: 0, hunks: [] })
    expect(changes[0]?.hunks[0]?.lines).toContain('+extra')
    expect(changesFromDiff(modifiedDiff, { includeHunks: false })[0]?.hunks).toEqual([])
  })

  it('handles empty input and rejects malformed or unsafe diffs', () => {
    expect(changesFromDiff(' \n\t')).toEqual([])
    expect(() => changesFromDiff('not a unified diff')).toThrow('Malformed unified diff')
    expect(() => changesFromDiff('diff --git a/../escape.ts b/escape.ts\n')).toThrow('Unsafe diff path')
  })

  it('selects sorted unique affected paths', () => {
    const changes: GuardianChange[] = [
      { status: 'deleted', oldPath: 'z.ts', additions: 0, deletions: 1, changedLines: 1, hunks: [] },
      { status: 'rename', oldPath: 'old.ts', newPath: 'a.ts', additions: 0, deletions: 0, changedLines: 0, hunks: [] },
      { status: 'modified', oldPath: 'a.ts', newPath: 'm.ts', additions: 0, deletions: 0, changedLines: 0, hunks: [] },
      { status: 'added', newPath: 'm.ts', additions: 1, deletions: 0, changedLines: 1, hunks: [] },
    ]
    expect(affectedFiles(changes)).toEqual(['a.ts', 'm.ts', 'z.ts'])
  })

  it('dispatches stdin and a safe diff file source', () => {
    const dir = createTempDir('drift-guardian-source-'); tempDirs.push(dir)
    writeFileSync(join(dir, 'change.diff'), modifiedDiff)
    expect(collectChanges(dir, { kind: 'stdin', content: modifiedDiff })[0]?.newPath).toBe('src/a.ts')
    expect(collectChanges(dir, { kind: 'file', path: 'change.diff' })[0]?.changedLines).toBe(3)
  })

  it('collects staged, base, and working-tree changes without shell execution', () => {
    const dir = createTempDir('drift-guardian-git-'); tempDirs.push(dir); initGitRepo(dir)
    writeFileSync(join(dir, 'tracked.ts'), 'one\n'); commitAll(dir, 'initial')
    writeFileSync(join(dir, 'tracked.ts'), 'two\n')
    expect(collectWorkingTreeChanges(dir)[0]?.newPath).toBe('tracked.ts')
    execFileSync('git', ['add', 'tracked.ts'], { cwd: dir, stdio: 'pipe' })
    writeFileSync(join(dir, 'untracked.ts'), 'ignored\n')
    expect(collectChanges(dir, { kind: 'staged' })).toHaveLength(1)
    expect(collectChanges(dir, { kind: 'base', ref: 'HEAD' })).toHaveLength(1)
    const marker = join(dir, 'marker')
    expect(() => collectChanges(dir, { kind: 'base', ref: `HEAD & echo pwned > "${marker}"` })).toThrow('Invalid git ref')
    expect(() => readFileSync(marker, 'utf8')).toThrow()
    expect(collectWorkingTreeChanges(dir).map(change => change.newPath)).not.toContain('untracked.ts')
  })

  it('returns empty for a repository without HEAD and rejects non-repositories', () => {
    const empty = createTempDir('drift-guardian-no-head-'); tempDirs.push(empty); initGitRepo(empty)
    expect(collectWorkingTreeChanges(empty)).toEqual([])
    const nonRepo = createTempDir('drift-guardian-not-repo-'); tempDirs.push(nonRepo)
    expect(() => collectWorkingTreeChanges(nonRepo)).toThrow('Not a git repository')
  })
})
