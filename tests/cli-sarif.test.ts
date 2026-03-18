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

describe('cli sarif output', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('serializes scan --format sarif output as SARIF JSON', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-scan-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'export const value = 1\n')

    const result = runCli(['scan', tmpDir, '--format', 'sarif'])
    expect(result.status).toBe(0)

    const sarif = JSON.parse(result.stdout)
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver.name).toBe('drift')
  })

  it('serializes ci --format sarif output as SARIF JSON', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-ci-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'export const value = 1\n')

    const result = runCli(['ci', tmpDir, '--format', 'sarif'])
    expect(result.status).toBe(0)

    const sarif = JSON.parse(result.stdout)
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver.name).toBe('drift')
  })

  it('serializes trust --format sarif output as SARIF JSON', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-cli-sarif-trust-'))
    writeFileSync(join(tmpDir, 'sample.ts'), 'export const value = 1\n')

    const result = runCli(['trust', tmpDir, '--format', 'sarif'])
    expect(result.status).toBe(0)

    const sarif = JSON.parse(result.stdout)
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver.name).toBe('drift')
  })

})
