import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

type CliResult = {
  status: number | null
  stdout: string
  stderr: string
}

function runCli(args: string[]): CliResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('min-score gate', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('fails scan --min-score 0 while preserving JSON output', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-min-score-scan-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const result = runCli(['scan', tmpDir, '--format', 'json', '--min-score', '0'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).totalScore).toBeGreaterThan(0)
  })

  it('fails ci --min-score 0 while preserving human CI output', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-min-score-ci-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const result = runCli(['ci', tmpDir, '--min-score', '0'])

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::warning')
  })

  it('keeps omitted thresholds unchanged and preserves strict positive thresholds', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-min-score-positive-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const baseline = runCli(['scan', tmpDir, '--format', 'json'])
    const score = JSON.parse(baseline.stdout).totalScore as number
    const exact = runCli(['scan', tmpDir, '--format', 'json', '--min-score', String(score)])
    const below = runCli(['scan', tmpDir, '--format', 'json', '--min-score', String(Math.max(0, score - 1))])

    expect(baseline.status).toBe(0)
    expect(exact.status).toBe(0)
    expect(below.status).toBe(1)
    expect(JSON.parse(exact.stdout).totalScore).toBe(score)
    expect(JSON.parse(below.stdout).totalScore).toBe(score)
  })
})
