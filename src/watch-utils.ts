import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

export type DebouncedWatcher = { close: () => void }

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

/** Return whether a recursive watch event belongs to an atomic output write. */
export function isOutputArtifactPath(eventPath: string, outputPath: string): boolean {
  if (samePath(eventPath, outputPath) || samePath(eventPath, dirname(outputPath))) return true

  const outputName = basename(outputPath)
  const eventName = basename(eventPath)
  const escapedOutputName = outputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedOutputName}\\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.tmp$`, 'i').test(eventName)
}

function isBenignWatcherError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EPERM' || code === 'ENOENT'
}

function reportWatcherError(error: unknown): void {
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? 'unknown'
  process.stderr.write(`[watch] watcher error (${code}): ${String(error)}\n`)
}

class DebouncedWatcherController implements DebouncedWatcher {
  private timer: ReturnType<typeof setTimeout> | undefined
  private watcher: FSWatcher | undefined
  private closed = false

  constructor(
    private readonly path: string,
    private readonly callback: () => void,
    private readonly delayMs: number,
    private readonly ignorePath?: (eventPath: string) => boolean,
  ) {}

  start(): void {
    try {
      this.watcher = watch(this.path, { recursive: true }, (_eventType, filename) => {
        this.handleChange(filename)
      })
      this.watcher.once('error', this.handleError)
      this.watcher.once('close', this.handleClose)
    } catch (error) {
      this.handleError(error)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.clearPendingCallback()
    const watcher = this.watcher
    this.watcher = undefined
    watcher?.close()
  }

  private handleChange(filename: string | Buffer | null): void {
    if (this.closed) return
    if (this.ignorePath && filename && this.ignorePath(resolve(this.path, filename.toString()))) return
    this.clearPendingCallback()
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.closed) this.callback()
    }, this.delayMs)
  }

  private handleError = (error: unknown): void => {
    this.closed = true
    this.clearPendingCallback()
    const watcher = this.watcher
    this.watcher = undefined
    watcher?.close()
    if (!isBenignWatcherError(error)) reportWatcherError(error)
  }

  private handleClose = (): void => {
    this.closed = true
    this.clearPendingCallback()
    this.watcher = undefined
  }

  private clearPendingCallback(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }
}

/**
 * Create a debounced fs.watch wrapper.
 *
 * Multiple change events within `delayMs` are collapsed into a single callback.
 * The returned object exposes a `close()` method to stop watching.
 */
export function createDebouncedWatcher(
  path: string,
  callback: () => void,
  delayMs = 300,
  ignorePath?: (eventPath: string) => boolean,
): DebouncedWatcher {
  const controller = new DebouncedWatcherController(path, callback, delayMs, ignorePath)
  controller.start()
  return controller
}
