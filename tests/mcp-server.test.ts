import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, execSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SessionCache, inspectMCPTools } from '../src/mcp-server.js'
import { analyzeProject } from '../src/analyzer.js'
import { loadConfig } from '../src/config.js'
import { buildReport } from '../src/reporter.js'

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function buildRealReport(projectPath: string) {
  const config = loadConfig(projectPath)
  const files = analyzeProject(projectPath, config)
  return buildReport(projectPath, files)
}

describe('SessionCache', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('returns the same report on cache hit', async () => {
    const dir = createTempDir('drift-mcp-cache-hit-')
    tempDirs.push(dir)
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    const cache = new SessionCache()
    const report = buildRealReport(dir)
    const generate = vi.fn().mockResolvedValue(report)

    const first = await cache.getReport(dir, generate)
    const second = await cache.getReport(dir, generate)

    expect(first).toBe(second)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent requests so the generator runs once', async () => {
    const dir = createTempDir('drift-mcp-cache-concurrent-')
    tempDirs.push(dir)
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    const cache = new SessionCache()
    const report = buildRealReport(dir)
    let calls = 0
    const generate = vi.fn().mockImplementation(async () => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 50))
      return report
    })

    const [first, second] = await Promise.all([
      cache.getReport(dir, generate),
      cache.getReport(dir, generate),
    ])

    expect(calls).toBe(1)
    expect(first).toBe(second)
  })

  it('regenerates after invalidation', async () => {
    const dir = createTempDir('drift-mcp-cache-invalidate-')
    tempDirs.push(dir)
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    const cache = new SessionCache()
    const report = buildRealReport(dir)
    const generate = vi.fn().mockResolvedValue(report)

    await cache.getReport(dir, generate)
    cache.invalidate(dir)
    await cache.getReport(dir, generate)

    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('clears all entries and watchers', async () => {
    const dir = createTempDir('drift-mcp-cache-clear-')
    tempDirs.push(dir)
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    const cache = new SessionCache()
    const report = buildRealReport(dir)
    const generate = vi.fn().mockResolvedValue(report)

    await cache.getReport(dir, generate)
    cache.clear()
    await cache.getReport(dir, generate)

    expect(generate).toHaveBeenCalledTimes(2)
  })
})

describe('inspectMCPTools', () => {
  it('exposes six drift tools with input schemas', () => {
    const tools = inspectMCPTools()

    expect(tools).toHaveLength(6)
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'drift_score',
        'drift_analyze',
        'drift_rules',
        'drift_trend',
        'drift_suggest',
        'drift_guard_check',
      ]),
    )
    for (const tool of tools) {
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe('object')
    }
  })
})

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts')
const TSX_LOADER = pathToFileURL(join(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs')).href

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, ['--import', TSX_LOADER, CLI_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status: number | null }
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    }
  }
}

function createRpcClient(child: ChildProcess) {
  let buffer = ''
  const allLines: string[] = []
  const pending: string[] = []
  const waiters: Array<(line: string) => void> = []

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      if (!line) continue
      allLines.push(line)
      if (waiters.length > 0) {
        waiters.shift()!(line)
      } else {
        pending.push(line)
      }
    }
  })

  function nextLine(): Promise<string> {
    if (pending.length > 0) {
      return Promise.resolve(pending.shift()!)
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  function send(message: unknown): void {
    child.stdin?.write(JSON.stringify(message) + '\n')
  }

  async function call(method: string, params: Record<string, unknown>, id: number): Promise<Record<string, unknown>> {
    send({ jsonrpc: '2.0', id, method, params })
    const line = await nextLine()
    return JSON.parse(line) as Record<string, unknown>
  }

  return { send, call, nextLine, get stdoutLines() { return allLines } }
}

describe('drift mcp CLI', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  function createProject(): string {
    const dir = createTempDir('drift-mcp-cli-')
    tempDirs.push(dir)
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    return dir
  }

  function initGitRepo(dir: string): void {
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    execSync('git add -A', { cwd: dir, stdio: 'pipe' })
    execSync('git commit -m "initial"', { cwd: dir, stdio: 'pipe' })
  }

  it('prints tool definitions with --inspect', () => {
    const dir = createProject()
    const { stdout, exitCode } = runCli(['mcp', '--inspect'], dir)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout) as { tools: Array<{ name: string }> }
    expect(parsed.tools).toHaveLength(6)
  })

  it('speaks JSON-RPC over stdio and handles all six tools', async () => {
    const dir = createProject()
    initGitRepo(dir)
    execSync('git tag base', { cwd: dir, stdio: 'pipe' })
    writeFileSync(join(dir, 'a.ts'), 'console.log("debug")\n')
    writeFileSync(join(dir, 'drift-history.json'), JSON.stringify({
      project: dir,
      snapshots: [
        { timestamp: '2026-07-01T00:00:00.000Z', label: '', score: 10, grade: 'CLEAN', totalIssues: 0, files: 1, byRule: {} },
      ],
    }))

    const child = spawn(process.execPath, ['--import', TSX_LOADER, CLI_PATH, 'mcp'], {
      cwd: dir,
      stdio: 'pipe',
    })

    const client = createRpcClient(child)
    const stderr: string[] = []
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')))

    async function shutdown(): Promise<void> {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 5000)
        child.on('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }

    try {
      const init = await client.call('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      }, 1)
      expect(init.result).toBeDefined()

      client.send({ jsonrpc: '2.0', method: 'notifications/initialized' })

      const toolsResp = await client.call('tools/list', {}, 2)
      expect((toolsResp.result as { tools: unknown[] }).tools).toHaveLength(6)

      const scoreResp = await client.call('tools/call', { name: 'drift_score', arguments: {} }, 3)
      expect(scoreResp.error).toBeUndefined()
      const scoreText = ((scoreResp.result as { content: Array<{ text: string }> }).content[0]).text
      const scoreResult = JSON.parse(scoreText) as { score: number; grade: string }
      expect(typeof scoreResult.score).toBe('number')
      expect(scoreResult.grade).toBeTruthy()

      const analyzeResp = await client.call('tools/call', { name: 'drift_analyze', arguments: { maxIssues: 5 } }, 4)
      expect(analyzeResp.error).toBeUndefined()
      const analyzeResult = JSON.parse(((analyzeResp.result as { content: Array<{ text: string }> }).content[0]).text) as { violations: unknown[] }
      expect(analyzeResult.violations.length).toBeGreaterThan(0)

      const rulesResp = await client.call('tools/call', { name: 'drift_rules', arguments: {} }, 5)
      expect(rulesResp.error).toBeUndefined()
      const rulesResult = JSON.parse(((rulesResp.result as { content: Array<{ text: string }> }).content[0]).text) as { rules: unknown[] }
      expect(rulesResult.rules.length).toBeGreaterThan(0)

      const trendResp = await client.call('tools/call', { name: 'drift_trend', arguments: { n: 5 } }, 6)
      expect(trendResp.error).toBeUndefined()
      const trendResult = JSON.parse(((trendResp.result as { content: Array<{ text: string }> }).content[0]).text) as { trend: unknown[] }
      expect(trendResult.trend.length).toBe(1)

      const suggestResp = await client.call('tools/call', { name: 'drift_suggest', arguments: { limit: 3 } }, 7)
      expect(suggestResp.error).toBeUndefined()
      const suggestResult = JSON.parse(((suggestResp.result as { content: Array<{ text: string }> }).content[0]).text) as { suggestions: unknown[] }
      expect(suggestResult.suggestions.length).toBeGreaterThan(0)

      const guardResp = await client.call('tools/call', { name: 'drift_guard_check', arguments: { baseRef: 'base', budget: 0 } }, 8)
      expect(guardResp.error).toBeUndefined()
      const guardResult = JSON.parse(((guardResp.result as { content: Array<{ text: string }> }).content[0]).text) as { passed: boolean; scoreDelta: number }
      expect(guardResult.passed).toBe(false)
      expect(typeof guardResult.scoreDelta).toBe('number')

      const unknownResp = await client.call('tools/call', { name: 'drift_nonexistent', arguments: {} }, 9)
      expect(unknownResp.error).toBeDefined()
      expect((unknownResp.error as { code: number }).code).toBe(-32601)

      const malformedResp = await client.call('tools/call', { name: '', arguments: {} }, 10)
      expect(malformedResp.error).toBeDefined()
      expect((malformedResp.error as { code: number }).code).toBe(-32600)

      for (const line of client.stdoutLines) {
        const parsed = JSON.parse(line)
        expect(parsed.jsonrpc).toBe('2.0')
      }
    } finally {
      await shutdown()
    }
  })
})
