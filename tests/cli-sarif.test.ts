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

type SarifOutput = {
  version: string
  runs: Array<{
    tool: {
      driver: {
        name: string
      }
    }
    results?: Array<{
      ruleId?: string
      message?: {
        text?: string
      }
    }>
  }>
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

function expectValidSarifFrom(result: CliResult): SarifOutput {
  expect(result.status).toBe(0)
  expect(result.stderr).not.toContain('Error:')

  const sarif = JSON.parse(result.stdout) as SarifOutput
  expect(sarif.version).toBe('2.1.0')
  expect(Array.isArray(sarif.runs)).toBe(true)
  expect(sarif.runs.length).toBeGreaterThan(0)
  expect(sarif.runs[0]?.tool.driver.name).toBe('drift')
  expect(Array.isArray(sarif.runs[0]?.results)).toBe(true)

  return sarif
}

describe('cli sarif output', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('serializes scan --format sarif output as SARIF JSON', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-scan-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const result = runCli(['scan', tmpDir, '--format', 'sarif'])
    const sarif = expectValidSarifFrom(result)
    expect(sarif.runs[0]?.results?.some((entry) => entry.ruleId === 'debug-leftover')).toBe(true)
  })

  it('serializes ci --format sarif output as SARIF JSON', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-ci-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const result = runCli(['ci', tmpDir, '--format', 'sarif'])
    const sarif = expectValidSarifFrom(result)
    expect(sarif.runs[0]?.results?.some((entry) => entry.ruleId === 'debug-leftover')).toBe(true)
  })

  it('serializes trust --format sarif output as SARIF JSON without requiring git base', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-trust-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'console.log("debug")\n')

    const result = runCli(['trust', tmpDir, '--format', 'sarif'])
    const sarif = expectValidSarifFrom(result)
    expect(sarif.runs[0]?.results?.some((entry) => entry.ruleId === 'debug-leftover')).toBe(true)
  })

})
