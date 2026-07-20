import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'drift-ai-guard-cli-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
  mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src', 'value.ts'), 'export const value = 1\n')
  git('add', '.'); git('commit', '-qm', 'initial')
  return repo
}

function cli(repo: string, args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, ...args], { cwd: process.cwd(), encoding: 'utf8' })
}

describe('ai-guard CLI contract', () => {
  it('analyzes staged and base sources from real git baselines', () => {
    const repo = makeRepo()
    writeFileSync(join(repo, 'src', 'value.ts'), 'export const value = 1\nconsole.log(value)\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    const staged = cli(repo, ['--staged', '--format', 'json'])
    expect(staged.status).toBe(1)
    const stagedJson = JSON.parse(staged.stdout)
    expect(stagedJson.source).toBe('staged')
    expect(stagedJson.newIssues.some((issue: { file: string }) => issue.file === 'src/value.ts')).toBe(true)

    execFileSync('git', ['reset', '-q'], { cwd: repo })
    const base = cli(repo, ['--base', 'HEAD', '--format', 'json'])
    expect(base.status).toBe(1)
    const baseJson = JSON.parse(base.stdout)
    expect(baseJson.source).toBe('base')
    expect(baseJson.newIssues.some((issue: { file: string }) => issue.file === 'src/value.ts')).toBe(true)
    expect(JSON.stringify(baseJson)).not.toContain(repo)
    rmSync(repo, { recursive: true, force: true })
  }, 60000)

  it('rejects conflicting sources and invalid formats with policy exit codes', () => {
    const repo = makeRepo()
    const conflict = cli(repo, ['--stdin', '--staged', '--format', 'json'])
    expect(conflict.status).toBe(2)
    expect(conflict.stderr).toMatch(/exactly one/i)
    const format = cli(repo, ['--stdin', '--format', 'xml'])
    expect(format.status).toBe(2)
    expect(format.stderr).toMatch(/invalid --format/i)
    rmSync(repo, { recursive: true, force: true })
  })

  it('emits byte-stable JSON for the same source', () => {
    const repo = makeRepo()
    const diff = '--- a/src/value.ts\n+++ b/src/value.ts\n@@ -1 +1 @@\n-export const value = 1\n+export const value = 2\n'
    const first = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, '--stdin', '--format', 'json'], { cwd: process.cwd(), input: diff, encoding: 'utf8' })
    const second = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, '--stdin', '--format', 'json'], { cwd: process.cwd(), input: diff, encoding: 'utf8' })
    expect(first.status).toBe(0); expect(second.status).toBe(0)
    expect(first.stdout).toBe(second.stdout)
    rmSync(repo, { recursive: true, force: true })
  })
})
