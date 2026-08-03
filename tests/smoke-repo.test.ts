import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { parseArgs, resolveTimeoutMs, runDriftCommand } from '../scripts/smoke-repo.mjs'

describe('repository smoke configuration', () => {
  it('keeps the 30 second default when no timeout is configured', () => {
    const options = parseArgs([])

    expect(resolveTimeoutMs(options, {})).toBe(30_000)
  })

  it('accepts an explicit timeout for slow review and trust commands', () => {
    const options = parseArgs(['--timeout', '120000'])

    expect(resolveTimeoutMs(options, {})).toBe(120_000)
  })

  it('gives the CLI timeout precedence over the environment timeout', () => {
    const options = parseArgs(['--timeout', '120000'])

    expect(resolveTimeoutMs(options, { DRIFT_SMOKE_TIMEOUT_MS: '45000' })).toBe(120_000)
  })

  it('accepts the timeout from the environment when the CLI flag is absent', () => {
    const options = parseArgs([])

    expect(resolveTimeoutMs(options, { DRIFT_SMOKE_TIMEOUT_MS: '45000' })).toBe(45_000)
  })

  it('rejects non-positive and non-integer timeout values', () => {
    expect(() => parseArgs(['--timeout', '0'])).toThrow('--timeout must be a positive integer')
    expect(() => resolveTimeoutMs(parseArgs([]), { DRIFT_SMOKE_TIMEOUT_MS: 'slow' })).toThrow(
      'DRIFT_SMOKE_TIMEOUT_MS must be a positive integer',
    )
  })

  it('threads a custom timeout to the child spawn and records timeout metadata', () => {
    const logsDir = mkdtempSync(`${tmpdir()}/drift-smoke-test-`)
    const spawnCalls: Array<{ command: string; options: { timeout?: number } }> = []

    try {
      const result = runDriftCommand({
        id: 'review-base-json',
        description: 'review against base ref as JSON',
        args: ['review', '--base', 'HEAD~1', '--json'],
        cwd: 'target-repo',
        logsDir,
        expectFailure: false,
        cliPath: 'src/cli.ts',
        tsxLoaderSpecifier: 'tsx',
        timeoutMs: 1250,
        spawn: (command, _args, options) => {
          spawnCalls.push({ command, options })
          return {
            stdout: '',
            stderr: '',
            status: null,
            signal: 'SIGTERM',
            pid: 42,
            error: Object.assign(new Error('spawn timed out'), { code: 'ETIMEDOUT' }),
          }
        },
      })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0]).toMatchObject({ command: process.execPath, options: { timeout: 1250 } })
      expect(result).toMatchObject({ timeoutMs: 1250, timedOut: true, exitCode: -1, signal: 'SIGTERM' })
      expect(readFileSync(result.stderrLog, 'utf8')).toContain('command timed out after 1250ms')
    } finally {
      rmSync(logsDir, { recursive: true, force: true })
    }
  })
})
