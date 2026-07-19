import { watch, type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'

export interface DebouncedWatcher {
  close: () => void
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
