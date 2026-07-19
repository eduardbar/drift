import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

export interface DebouncedWatcher {
  close: () => void
}

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
  let timer: ReturnType<typeof setTimeout> | undefined

  const watcher: FSWatcher = watch(path, { recursive: true }, (_eventType, filename) => {
    if (ignorePath && filename && ignorePath(resolve(path, filename.toString()))) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      callback()
    }, delayMs)
  })

  return {
    close: () => {
      if (timer) clearTimeout(timer)
      watcher.close()
    },
  }
}
