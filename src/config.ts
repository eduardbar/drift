import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DriftConfig } from './types.js'

/**
 * Load drift.config.ts / .js / .json from the given project root.
 * Returns undefined if no config file is found.
 *
 * Search order (first match wins):
 *   1. drift.config.ts
 *   2. drift.config.js
 *   3. drift.config.json
 */
export async function loadConfig(projectRoot: string): Promise<DriftConfig | undefined> {
  const candidates = [
    join(projectRoot, 'drift.config.ts'),
    join(projectRoot, 'drift.config.js'),
    join(projectRoot, 'drift.config.json'),
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue

    try {
      const ext = candidate.split('.').pop()

      if (ext === 'json') {
        const { readFileSync } = await import('node:fs')
        return JSON.parse(readFileSync(candidate, 'utf-8')) as DriftConfig
      }

      // .ts / .js — dynamic import via file URL
      const fileUrl = pathToFileURL(resolve(candidate)).href
      const mod = await import(fileUrl)
      const config: DriftConfig = mod.default ?? mod

      return config
    } catch { // drift-ignore
      // drift-ignore: catch-swallow — config is optional; load failure is non-fatal
    }
  }

  return undefined
}
