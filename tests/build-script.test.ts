import { describe, expect, it } from 'vitest'
import { childExitCode, runChildProcess } from '../scripts/build.mjs'

describe('build process wrapper', () => {
  it('preserves a compiler numeric exit status', () => {
    const result = runChildProcess(process.execPath, ['-e', 'process.exit(42)'], { stdio: 'ignore' })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(42)
    expect(childExitCode(result, { reemitSignal: false })).toBe(42)
  })

  it('uses a deterministic fallback for signal termination when re-emission is disabled', () => {
    const result = runChildProcess(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"], { stdio: 'ignore' })

    if (result.signal) {
      expect(childExitCode(result, { reemitSignal: false })).toBe(1)
    } else {
      expect(result.status).not.toBe(0)
    }
  })

  it('re-emits a signal through the injected killer without terminating the test process', () => {
    const previousExitCode = process.exitCode
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []

    try {
      const exitCode = childExitCode(
        { status: null, signal: 'SIGTERM', error: undefined },
        { signalKiller: (pid, signal) => signals.push({ pid, signal }) },
      )

      expect(exitCode).toBeNull()
      expect(signals).toEqual([{ pid: process.pid, signal: 'SIGTERM' }])
    } finally {
      process.exitCode = previousExitCode
    }
  })

  it('keeps spawn failures distinct and preserves their diagnostic code', () => {
    const result = runChildProcess('drift-command-that-does-not-exist', [], { stdio: 'ignore' })

    expect(result.error).toBeDefined()
    expect(() => childExitCode(result, { reemitSignal: false })).toThrow(/Failed to spawn compiler/)
    expect(() => childExitCode(result, { reemitSignal: false })).toThrow(/ENOENT|not found/i)
  })
})
