import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distPath = resolve(repoRoot, 'dist')
const tscPath = resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')

export function runChildProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })
}

export function childExitCode(result, { reemitSignal = true, signalKiller = process.kill } = {}) {
  if (result.error) {
    const error = new Error(`Failed to spawn compiler: ${result.error.message}`, { cause: result.error })
    error.code = result.error.code
    throw error
  }

  if (result.status !== null) return result.status

  if (result.signal) {
    if (reemitSignal) {
      try {
        process.exitCode = 1
        signalKiller(process.pid, result.signal)
        return null
      } catch (error) {
        process.stderr.write(`Unable to re-emit compiler signal ${result.signal}: ${String(error)}\n`)
      }
    }
    return 1
  }

  return 1
}

export function build() {
  if (existsSync(distPath)) {
    rmSync(distPath, { recursive: true, force: true })
  }

  const result = runChildProcess(process.execPath, [tscPath], { cwd: repoRoot })
  const exitCode = childExitCode(result)
  if (exitCode !== null) process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    build()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
