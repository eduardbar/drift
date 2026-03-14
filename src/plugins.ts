import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { DriftPlugin, PluginLoadError, LoadedPlugin } from './types.js'

const require = createRequire(import.meta.url)

function isPluginShape(value: unknown): value is DriftPlugin {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DriftPlugin>
  if (typeof candidate.name !== 'string') return false
  if (!Array.isArray(candidate.rules)) return false
  return candidate.rules.every((rule) =>
    rule &&
    typeof rule === 'object' &&
    typeof rule.name === 'string' &&
    typeof rule.detect === 'function'
  )
}

function normalizePluginExport(mod: unknown): DriftPlugin | undefined {
  if (isPluginShape(mod)) return mod
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const maybeDefault = (mod as { default?: unknown }).default
    if (isPluginShape(maybeDefault)) return maybeDefault
  }
  return undefined
}

function resolvePluginSpecifier(projectRoot: string, pluginId: string): string {
  if (pluginId.startsWith('.') || pluginId.startsWith('/')) {
    const abs = isAbsolute(pluginId) ? pluginId : resolve(projectRoot, pluginId)
    if (existsSync(abs)) return abs
    if (existsSync(`${abs}.js`)) return `${abs}.js`
    if (existsSync(`${abs}.cjs`)) return `${abs}.cjs`
    if (existsSync(`${abs}.mjs`)) return `${abs}.mjs`
    if (existsSync(`${abs}.ts`)) return `${abs}.ts`
    return abs
  }
  return pluginId
}

export function loadPlugins(projectRoot: string, pluginIds: string[] | undefined): {
  plugins: LoadedPlugin[]
  errors: PluginLoadError[]
} {
  if (!pluginIds || pluginIds.length === 0) {
    return { plugins: [], errors: [] }
  }

  const loaded: LoadedPlugin[] = []
  const errors: PluginLoadError[] = []

  for (const pluginId of pluginIds) {
    const resolved = resolvePluginSpecifier(projectRoot, pluginId)
    try {
      const mod = require(resolved)
      const plugin = normalizePluginExport(mod)
      if (!plugin) {
        errors.push({
          pluginId,
          message: `Invalid plugin contract in '${pluginId}'. Expected: { name, rules[] }`,
        })
        continue
      }
      loaded.push({ id: pluginId, plugin })
    } catch (error) {
      errors.push({
        pluginId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { plugins: loaded, errors }
}
