import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { watchMock, nativeWatch } = vi.hoisted(() => ({
  watchMock: vi.fn(),
  nativeWatch: { current: undefined as typeof import('node:fs').watch | undefined },
}))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  nativeWatch.current = actual.watch
  watchMock.mockImplementation(actual.watch)
  return { ...actual, watch: watchMock }
})

import { createDebouncedWatcher } from '../src/watch-utils.js'

class FakeWatcher extends EventEmitter {
  private changeHandler?: (eventType: string, filename: string) => void

  close = vi.fn(() => {
    this.emit('close')
  })

  setChangeHandler(handler: (eventType: string, filename: string) => void): void {
    this.changeHandler = handler
  }

  emitChange(eventType: string, filename: string): void {
    this.changeHandler?.(eventType, filename)
  }
}

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
    watchMock.mockReset()
    watchMock.mockImplementation(nativeWatch.current!)
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

  it.each(['EPERM', 'ENOENT'] as const)(
    'tolerates synchronous %s while the target is disappearing during creation',
    (code) => {
      const error = Object.assign(new Error(`watch failed: ${code}`), { code })
      watchMock.mockImplementationOnce(() => {
        throw error
      })

      const watcher = createDebouncedWatcher('missing-target', vi.fn())

      expect(() => watcher.close()).not.toThrow()
    },
  )

  it.each(['EPERM', 'ENOENT'] as const)(
    'closes safely and clears pending work after an async %s watcher error',
    async (code) => {
      const nativeWatcher = new FakeWatcher()
      watchMock.mockImplementationOnce((_path, _options, callback) => {
        nativeWatcher.setChangeHandler(callback)
        return nativeWatcher
      })
      const callback = vi.fn()
      const watcher = createDebouncedWatcher('disappearing-target', callback, 25)
      nativeWatcher.emitChange('rename', 'file.ts')
      nativeWatcher.emit('error', Object.assign(new Error(code), { code }))

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(callback).not.toHaveBeenCalled()
      expect(nativeWatcher.close).toHaveBeenCalledTimes(1)
      expect(() => watcher.close()).not.toThrow()
      expect(() => watcher.close()).not.toThrow()
    },
  )

  it('reports non-benign watcher errors without converting them into unhandled events', () => {
    const nativeWatcher = new FakeWatcher()
    watchMock.mockReturnValueOnce(nativeWatcher)
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    createDebouncedWatcher('watched-target', vi.fn(), 25)
    const error = Object.assign(new Error('watch failed'), { code: 'EIO' })

    nativeWatcher.emit('error', error)

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('EIO'))
    expect(nativeWatcher.close).toHaveBeenCalledTimes(1)
  })
})
