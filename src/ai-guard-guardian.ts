import { rmSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CLEANUP_GUARDIAN_MODULE_BASENAME } from './cleanup-guardian.js'

const SOURCE_EXTENSION = '.ts'
const READINESS_TIMEOUT_MS = 5_000
const STOP_TIMEOUT_MS = 2_000
const READY_LINE = 'ready'
const CLEANUP_RETRIES = 100
const CLEANUP_RETRY_DELAY_MS = 100
const SIGINT_EXIT_CODE = 130
const SIGTERM_EXIT_CODE = 143

function guardianInvocation(): string[] {
  const sourceExecution = fileURLToPath(import.meta.url).endsWith(SOURCE_EXTENSION)
  const extension = sourceExecution ? SOURCE_EXTENSION.slice(1) : 'js'
  const guardianPath = fileURLToPath(new URL(`./${CLEANUP_GUARDIAN_MODULE_BASENAME}.${extension}`, import.meta.url))
  return [...(sourceExecution ? ['--import', 'tsx'] : []), guardianPath]
}

function terminate(child: ChildProcess, signal: NodeJS.Signals): boolean {
  try { return child.kill(signal) } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`ai-guard guardian: unable to send ${signal}: ${message}\n`)
    return false
  }
}

function removeRoot(root: string): boolean {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_DELAY_MS })
    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`ai-guard cleanup: ${message}\n`)
    return false
  }
}

async function waitForStop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => {
    let settled = false
    const finish = (): void => { if (!settled) { settled = true; clearTimeout(timeout); resolve() } }
    const timeout = setTimeout(() => { terminate(child, 'SIGKILL'); finish() }, STOP_TIMEOUT_MS)
    child.once('close', finish)
    child.once('error', finish)
    terminate(child, 'SIGTERM')
  })
}

async function waitForReady(child: ChildProcess): Promise<boolean> {
  const stdout = child.stdout
  if (!stdout) return false
  return new Promise<boolean>(resolve => {
    let settled = false
    let output = ''
    let timeout: ReturnType<typeof setTimeout>
    const cleanup = (): void => {
      stdout.removeListener('data', onData)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      clearTimeout(timeout)
    }
    const finish = (ready: boolean): void => { if (!settled) { settled = true; cleanup(); resolve(ready) } }
    const onData = (chunk: Buffer | string): void => { output += String(chunk); if (output.split(/\r?\n/).includes(READY_LINE)) finish(true) }
    const onError = (): void => finish(false)
    const onExit = (): void => finish(false)
    stdout.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
    timeout = setTimeout(() => finish(false), READINESS_TIMEOUT_MS)
  })
}

export async function withCleanupGuardian<T>(root: string, operation: (signal: () => NodeJS.Signals | undefined) => Promise<T>): Promise<T> {
  const child = spawn(process.execPath, [...guardianInvocation(), root, String(process.pid)], { detached: true, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  let interrupted: NodeJS.Signals | undefined
  let onInt: () => void = () => undefined
  let onTerm: () => void = () => undefined
  const onSignal = (signal: NodeJS.Signals): void => {
    if (interrupted) return
    interrupted = signal
    removeRoot(root)
    process.removeListener('SIGINT', onInt)
    process.removeListener('SIGTERM', onTerm)
    try { process.kill(process.pid, signal) } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`ai-guard signal: ${message}\n`)
       process.exit(signal === 'SIGINT' ? SIGINT_EXIT_CODE : SIGTERM_EXIT_CODE)
    }
  }
  onInt = () => onSignal('SIGINT')
  onTerm = () => onSignal('SIGTERM')
  process.once('SIGINT', onInt)
  process.once('SIGTERM', onTerm)
  if (!child.stdin || !child.stdout || !(await waitForReady(child))) {
    child.stdin?.destroy()
    child.stdout?.destroy()
    await waitForStop(child)
    removeRoot(root)
    process.removeListener('SIGINT', onInt)
    process.removeListener('SIGTERM', onTerm)
    throw new Error('Unable to establish ai-guard cleanup guardian readiness')
  }
  child.stdin.destroy()
  child.stdout.destroy()
  child.unref()
  try {
    const result = await operation(() => interrupted)
    if (interrupted) throw new Error(`interrupted by ${interrupted}`)
    return result
  } finally {
    process.removeListener('SIGINT', onInt)
    process.removeListener('SIGTERM', onTerm)
    removeRoot(root)
    await waitForStop(child)
  }
}
