import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const repoRoot = process.cwd()
const tempDirs: string[] = []
const npmCommand = process.platform === 'win32' ? 'npm' : 'npm'
const CHILD_TIMEOUT_MS = 30_000

function runBounded(command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) {
  return spawnSync(command, args, {
    ...options,
    timeout: CHILD_TIMEOUT_MS,
    killSignal: 'SIGTERM',
    windowsHide: true,
  })
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'drift-phase5-e2e-'))
  tempDirs.push(root)
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(root, 'value.ts'), 'export const value = 1\n')
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'test@example.com'],
    ['config', 'user.name', 'Drift Test'],
    ['add', '.'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = runBounded('git', args, { cwd: root, stdio: 'pipe' })
    if (result.status !== 0) throw new Error(`fixture git command failed: git ${args.join(' ')}\n${result.stderr ?? ''}`)
  }
  return root
}

function runSmoke(target: string, output: string) {
  return runBounded(process.execPath, [join(repoRoot, 'scripts', 'smoke-repo.mjs'), target, '--ai-integration', '--out', output], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function listOwnedGuardianProcesses(processIds: number[]): string[] {
  if (processIds.length === 0) return []
  const result = process.platform === 'win32'
    ? runBounded('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf8' })
    : runBounded('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
  if (result.status !== 0 || result.error) throw new Error(`process inventory failed: ${result.stderr ?? result.error?.message ?? ''}`)
  const output = String(result.stdout ?? '')
  return processIds.flatMap((processId) => output.split(/\r?\n/).filter((line) => line.includes('cleanup-guardian') && new RegExp(`(?:^|[^0-9])${processId}(?:[^0-9]|$)`).test(line)))
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('Phase 5 built/package E2E smoke', () => {
  it('covers context freshness, MCP inspection, deterministic ai-guard, and package guardian output', () => {
    const build = runBounded(npmCommand, ['run', 'build'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' })
    expect(build.error?.code, build.stderr?.toString()).not.toBe('ETIMEDOUT')
    expect(build.status, build.stderr?.toString()).toBe(0)
    const guardianRootsBefore = readdirSync(tmpdir()).filter((entry) => entry.startsWith('drift-ai-guard-')).sort()
    const fixture = createFixture()
    const output = join(fixture, 'smoke-output')
    const smoke = runSmoke(fixture, output)

    expect(smoke.status, smoke.stderr).toBe(0)
    const report = JSON.parse(readFileSync(join(output, 'smoke-report.json'), 'utf8'))
    expect(report.overallStatus).toBe('pass')
    expect(report.commands.every((command: { timeoutMs: number; timedOut: boolean }) => command.timeoutMs === 30_000 && command.timedOut === false)).toBe(true)
    expect(report.commands.map((command: { id: string }) => command.id)).toEqual([
      'context-generate',
      'context-ci-fresh',
      'mcp-inspect',
      'ai-guard-safe',
      'ai-guard-safe-repeat',
    ])

    const contextPath = join(output, 'artifacts', 'context.md')
    expect(existsSync(contextPath)).toBe(true)
    expect(readFileSync(contextPath, 'utf8')).toContain('# Drift Context')

    const mcp = JSON.parse(readFileSync(join(output, 'logs', 'mcp-inspect.stdout.log'), 'utf8'))
    expect(mcp.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'drift_score',
      'drift_analyze',
      'drift_rules',
      'drift_trend',
      'drift_suggest',
      'drift_guard_check',
    ])

    const firstGuard = readFileSync(join(output, 'logs', 'ai-guard-safe.stdout.log'), 'utf8')
    const secondGuard = readFileSync(join(output, 'logs', 'ai-guard-safe-repeat.stdout.log'), 'utf8')
    expect(firstGuard).toBe(secondGuard)
    expect(JSON.parse(firstGuard).passed).toBe(true)

    const packRun = runBounded(npmCommand, ['pack', '--dry-run', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    expect(packRun.error?.code, packRun.stderr?.toString()).not.toBe('ETIMEDOUT')
    expect(packRun.status, packRun.stderr?.toString()).toBe(0)
    const pack = JSON.parse(String(packRun.stdout))
    const packedFiles = pack[0].files.map((file: { path: string }) => file.path)
    expect(packedFiles).toContain('dist/ai-guard-guardian.js')
    expect(packedFiles).toContain('bin/drift.js')
    expect(readdirSync(tmpdir()).filter((entry) => entry.startsWith('drift-ai-guard-')).sort()).toEqual(guardianRootsBefore)
    expect(listOwnedGuardianProcesses(report.commands.map((command: { processId: number }) => command.processId))).toEqual([])
  }, 120000)
})
