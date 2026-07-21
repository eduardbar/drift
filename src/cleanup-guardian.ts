#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { lstatSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1_000
const MAX_FALLBACK_TIMEOUT_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
const PARENT_POLL_INTERVAL_MS = 250
const CLEANUP_RETRY_COUNT = 100
const CLEANUP_RETRY_DELAY_MS = 100
const INVALID_ARGUMENTS_EXIT_CODE = 2
const CLEANUP_FAILURE_EXIT_CODE = 1
const SUCCESS_EXIT_CODE = 0
const READY_OUTPUT = 'ready\n'
const READY_MARKER_FILE = '.guardian-ready'
const ROOT_ARGUMENT_INDEX = 2
const PARENT_PID_ARGUMENT_INDEX = 3
const GUARD_ROOT_PATTERN = /^drift-ai-guard-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-z0-9]{6}$/i

export const CLEANUP_GUARDIAN_MODULE_BASENAME = 'cleanup-guardian'

interface GuardianArguments {
  readonly rootArgument: string | undefined
  readonly parentPid: number
  readonly fallbackMs: number
}

function comparable(value: string): string {
  const normalized = normalize(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function parseArguments(argv: readonly string[], environment: NodeJS.ProcessEnv): GuardianArguments {
  return {
    rootArgument: argv[ROOT_ARGUMENT_INDEX],
    parentPid: Number(argv[PARENT_PID_ARGUMENT_INDEX]),
    fallbackMs: Number(environment.DRIFT_AI_GUARD_GUARDIAN_TIMEOUT_MS ?? DEFAULT_FALLBACK_TIMEOUT_MS),
  }
}

function validParentPid(parentPid: number): boolean {
  return Number.isInteger(parentPid) && parentPid > 0
}

function validTimeout(fallbackMs: number): boolean {
  return Number.isFinite(fallbackMs) && fallbackMs > 0 && fallbackMs <= MAX_FALLBACK_TIMEOUT_MS
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`cleanup guardian: ${message}\n`)
}

function validateRoot(argumentsValue: GuardianArguments): string | undefined {
  const { rootArgument, parentPid, fallbackMs } = argumentsValue
  if (!rootArgument || !validParentPid(parentPid) || !validTimeout(fallbackMs)) return undefined

  const candidate = resolve(rootArgument)
  if (!GUARD_ROOT_PATTERN.test(basename(candidate))) return undefined

  try {
    const candidateStat = lstatSync(candidate)
    if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) return undefined
    const tempRoot = realpathSync.native(resolve(tmpdir()))
    const canonicalRoot = realpathSync.native(candidate)
    if (comparable(candidate) !== comparable(canonicalRoot)) return undefined
    if (comparable(dirname(canonicalRoot)) !== comparable(tempRoot)) return undefined
    return candidate
  } catch (error: unknown) {
    reportError(error)
    return undefined
  }
}

function cleanupRoot(root: string): boolean {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: CLEANUP_RETRY_COUNT, retryDelay: CLEANUP_RETRY_DELAY_MS })
    return true
  } catch (error: unknown) {
    reportError(error)
    return false
  }
}

function parentAlive(parentPid: number): boolean {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('tasklist', ['/FI', `PID eq ${parentPid}`, '/NH'], { encoding: 'utf8', windowsHide: true })
      return new RegExp(`\\b${parentPid}\\b`).test(output)
    } catch (error: unknown) {
      return parentProbeFailed(error)
    }
  }
  try {
    process.kill(parentPid, 0)
    return true
  } catch (error: unknown) {
    return parentProbeFailed(error)
  }
}

function parentProbeFailed(error: unknown): boolean {
  if (!(error instanceof Error)) reportError(error)
  return false
}

function runCleanupGuardian(argumentsValue: GuardianArguments): void {
  const root = validateRoot(argumentsValue)
  if (!root) {
    process.stderr.write('cleanup guardian: invalid root, parent PID, or timeout\n')
    process.exit(INVALID_ARGUMENTS_EXIT_CODE)
  }

  let stopped = false
  let watcher: NodeJS.Timeout | undefined
  let fallbackTimer: NodeJS.Timeout | undefined
  const stop = (): void => {
    if (stopped) return
    stopped = true
    if (watcher) clearInterval(watcher)
    if (fallbackTimer) clearTimeout(fallbackTimer)
    const cleaned = cleanupRoot(root)
    process.exit(cleaned ? SUCCESS_EXIT_CODE : CLEANUP_FAILURE_EXIT_CODE)
  }

  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  watcher = setInterval((): void => {
    if (!parentAlive(argumentsValue.parentPid)) stop()
  }, PARENT_POLL_INTERVAL_MS)
  fallbackTimer = setTimeout(stop, argumentsValue.fallbackMs)

  try {
    writeFileSync(join(root, READY_MARKER_FILE), String(argumentsValue.parentPid), { flag: 'wx' })
  } catch (error: unknown) {
    reportError(error)
    stop()
    return
  }
  process.stdout.write(READY_OUTPUT)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCleanupGuardian(parseArguments(process.argv, process.env))
}
