import { describe, expect, it } from 'vitest'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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

function cli(repo: string, args: string[], input = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, ...args], { cwd: process.cwd(), input, encoding: 'utf8' })
}

const diffWithIssue = '--- a/src/value.ts\n+++ b/src/value.ts\n@@ -1 +2 @@\n export const value = 1\n+console.log(value)\n'

async function waitForRoot(before: string[], parentPid: number, timeoutMs = 15000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const roots = (await readdir(tmpdir())).filter(name => {
      const marker = join(tmpdir(), name, '.guardian-ready')
      return name.startsWith('drift-ai-guard-')
        && !before.includes(name)
        && existsSync(marker)
        && readFileSync(marker, 'utf8') === String(parentPid)
    })
    if (roots.length === 1) return join(tmpdir(), roots[0])
    if (roots.length > 1) throw new Error(`expected one new ai-guard root, found ${roots.join(', ')}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('ai-guard temp root was not created')
}

async function waitForDisappearance(root: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { await access(root) } catch { return }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`temp root survived termination: ${root}`)
}

async function waitForReadiness(output: () => string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (output().split(/\r?\n/).includes('ready')) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('guardian did not acknowledge readiness within bounded timeout')
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs = 10000): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('child did not exit within bounded timeout')), timeoutMs)
    child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }) })
  })
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

  it('reads the documented --diff-file source and rejects the unsupported --file alias', () => {
    const repo = makeRepo()
    const diffFile = join(repo, 'change.diff')
    writeFileSync(diffFile, diffWithIssue)
    const documented = cli(repo, ['--diff-file', 'change.diff', '--format', 'json'])
    expect(documented.status).toBe(1)
    expect(JSON.parse(documented.stdout).source).toBe('file')
    const unsupported = cli(repo, ['--file', 'change.diff', '--format', 'json'])
    expect(unsupported.status).toBe(2)
    expect(unsupported.stderr).toMatch(/unknown option.*--file/i)
    rmSync(repo, { recursive: true, force: true })
  })

  it('rejects a missing source and enforces budget and block-on policies', () => {
    const repo = makeRepo()
    const missing = cli(repo, ['--format', 'json'])
    expect(missing.status).toBe(2)
    expect(missing.stderr).toMatch(/exactly one diff source/i)
    const budget = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, '--stdin', '--budget', '-1', '--format', 'json'], { cwd: process.cwd(), input: diffWithIssue, encoding: 'utf8' })
    expect(budget.status).toBe(1)
    expect(JSON.parse(budget.stdout).reason).toMatch(/budget/i)
    const block = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, '--stdin', '--budget', '100', '--block-on', 'debug-leftover', '--format', 'json'], { cwd: process.cwd(), input: diffWithIssue, encoding: 'utf8' })
    expect(block.status).toBe(1)
    expect(JSON.parse(block.stdout).reason).toMatch(/blocked by debug-leftover/i)
    rmSync(repo, { recursive: true, force: true })
  })

  it('prints suggestions only when requested and handles empty and binary diffs explicitly', () => {
    const repo = makeRepo()
    const suggestions = cli(repo, ['--stdin', '--suggestions', '--format', 'json'], diffWithIssue)
    expect(suggestions.status).toBe(1)
    expect(JSON.parse(suggestions.stdout).suggestions[0].suggestion).toBeTruthy()
    const empty = cli(repo, ['--stdin', '--format', 'json'], '')
    expect(empty.status).toBe(2)
    expect(empty.stderr).toMatch(/diff source is empty/i)
    const binary = cli(repo, ['--stdin', '--format', 'json'], 'diff --git a/assets/image.png b/assets/image.png\nBinary files a/assets/image.png and b/assets/image.png differ\n')
    expect(binary.status).toBe(0)
    rmSync(repo, { recursive: true, force: true })
  })

  it('requires an existing canonical guard root and polls parent death without stdin EOF', async () => {
    const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })
    const root = mkdtempSync(join(tmpdir(), `drift-ai-guard-${randomUUID()}-`))
    const guardianPath = join(process.cwd(), 'src', 'cleanup-guardian.ts')
    const guardian = spawn(process.execPath, ['--import', 'tsx', guardianPath, root, String(parent.pid)], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    guardian.stdout.on('data', chunk => { stdout += String(chunk) })
    let succeeded = false
    try {
      await waitForReadiness(() => stdout)
      expect(stdout).toContain('ready')
      parent.kill('SIGTERM')
      await waitForExit(parent)
      await waitForExit(guardian)
      expect(existsSync(root)).toBe(false)

      const missing = spawnSync(process.execPath, ['--import', 'tsx', guardianPath, join(tmpdir(), `drift-ai-guard-${randomUUID()}-`), String(process.pid)], { encoding: 'utf8' })
      expect(missing.status).toBe(2)
      expect(missing.stdout).toBe('')
      succeeded = true
    } finally {
      if (!succeeded) {
        if (parent.exitCode === null && parent.signalCode === null) parent.kill('SIGTERM')
        if (guardian.exitCode === null && guardian.signalCode === null) guardian.kill('SIGTERM')
        if (parent.exitCode === null || guardian.exitCode === null) {
          await Promise.allSettled([waitForExit(parent), waitForExit(guardian)])
        }
        if (existsSync(root)) rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it.skipIf(process.platform !== 'win32').each(['SIGTERM', 'SIGINT'])('cleans the exact temp root when terminated by %s on Windows', async (signal) => {
    if (process.platform !== 'win32') return
    const repo = makeRepo()
    const before = (await readdir(tmpdir())).filter(name => name.startsWith('drift-ai-guard-'))
    const diffFile = join(repo, 'termination.diff')
    writeFileSync(diffFile, diffWithIssue)
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'ai-guard', repo, '--diff-file', 'termination.diff'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    let root: string | undefined
    let succeeded = false
    try {
      root = await waitForRoot(before, child.pid!)
      child.kill(signal as NodeJS.Signals)
      const result = await waitForExit(child)
      expect(result.signal, stderr).toBe(signal)
      await waitForDisappearance(root)
      succeeded = true
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await waitForExit(child)
      }
      if (!succeeded && root && existsSync(root)) rmSync(root, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  }, 60000)

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
