import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const repoRoot = process.cwd()
const tempDirs: string[] = []
const npmCommand = process.platform === 'win32' ? 'npm' : 'npm'

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'drift-phase5-e2e-'))
  tempDirs.push(root)
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(root, 'value.ts'), 'export const value = 1\n')
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Drift Test'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root })
  return root
}

function runSmoke(target: string, output: string) {
  return spawnSync(process.execPath, [join(repoRoot, 'scripts', 'smoke-repo.mjs'), target, '--ai-integration', '--out', output], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
  })
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('Phase 5 built/package E2E smoke', () => {
  it('covers context freshness, MCP inspection, deterministic ai-guard, and package guardian output', () => {
    execFileSync(npmCommand, ['run', 'build'], { cwd: repoRoot, stdio: 'pipe', shell: process.platform === 'win32' })
    const guardianRootsBefore = readdirSync(tmpdir()).filter((entry) => entry.startsWith('drift-ai-guard-')).sort()
    const fixture = createFixture()
    const output = join(fixture, 'smoke-output')
    const smoke = runSmoke(fixture, output)

    expect(smoke.status, smoke.stderr).toBe(0)
    const report = JSON.parse(readFileSync(join(output, 'smoke-report.json'), 'utf8'))
    expect(report.overallStatus).toBe('pass')
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
    expect(mcp.tools).toHaveLength(6)
    expect(new Set(mcp.tools.map((tool: { name: string }) => tool.name)).size).toBe(6)

    const firstGuard = readFileSync(join(output, 'logs', 'ai-guard-safe.stdout.log'), 'utf8')
    const secondGuard = readFileSync(join(output, 'logs', 'ai-guard-safe-repeat.stdout.log'), 'utf8')
    expect(firstGuard).toBe(secondGuard)
    expect(JSON.parse(firstGuard).passed).toBe(true)

    const pack = JSON.parse(execFileSync(npmCommand, ['pack', '--dry-run', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    }))
    const packedFiles = pack[0].files.map((file: { path: string }) => file.path)
    expect(packedFiles).toContain('dist/ai-guard-guardian.js')
    expect(packedFiles).toContain('bin/drift.js')
    expect(readdirSync(tmpdir()).filter((entry) => entry.startsWith('drift-ai-guard-')).sort()).toEqual(guardianRootsBefore)
  }, 90000)
})
