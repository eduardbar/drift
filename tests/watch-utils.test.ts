import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDebouncedWatcher } from '../src/watch-utils.js'

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('createDebouncedWatcher', () => {
  const tempDirs: string[] = []
  const watchers: Array<{ close: () => void }> = []

  afterEach(() => {
    for (const watcher of watchers) {
      watcher.close()
    }
    watchers.length = 0
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
    vi.restoreAllMocks()
  })

  it('calls callback after a change within debounce window', async () => {
    const dir = createTempDir('drift-watch-')
    tempDirs.push(dir)
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'export const a = 1\n')

    const cb = vi.fn()
    const watcher = createDebouncedWatcher(dir, cb, 50)
    watchers.push(watcher)

    // Wait for initial watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 100))
    writeFileSync(file, 'export const a = 2\n')

    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1), { timeout: 2000 })
  })

  it('debounces multiple rapid changes into a single callback', async () => {
    const dir = createTempDir('drift-watch-debounce-')
    tempDirs.push(dir)
    const file = join(dir, 'a.ts')
    writeFileSync(file, 'export const a = 1\n')

    const cb = vi.fn()
    const watcher = createDebouncedWatcher(dir, cb, 100)
    watchers.push(watcher)

    await new Promise((resolve) => setTimeout(resolve, 100))

    writeFileSync(file, 'export const a = 2\n')
    writeFileSync(file, 'export const a = 3\n')
    writeFileSync(file, 'export const a = 4\n')

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('can be closed without error', () => {
    const dir = createTempDir('drift-watch-close-')
    tempDirs.push(dir)
    const watcher = createDebouncedWatcher(dir, vi.fn(), 50)
    watchers.push(watcher)

    expect(() => watcher.close()).not.toThrow()
  })
})
