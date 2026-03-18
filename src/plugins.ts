import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { DriftPlugin, LoadedPlugin, PluginLoadError, PluginLoadWarning } from './types.js'
import { normalizeRules, type PluginValidationContext } from './plugins-rules.js'
import { validateCapabilities } from './plugins-capabilities.js'
import { pushError, pushWarning } from './plugins-messages.js'

const require = createRequire(import.meta.url)
const SUPPORTED_PLUGIN_API_VERSION = 1

type PluginCandidate = {
  name?: unknown
  apiVersion?: unknown
  capabilities?: unknown
  rules?: unknown
}

function normalizePluginExport(mod: unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default?: unknown }).default ?? mod
  }
  return mod
}

function ensureObjectCandidate(
  pluginId: string,
  candidate: unknown,
  errors: PluginLoadError[],
): PluginCandidate | undefined {
  if (candidate && typeof candidate === 'object') {
    return candidate as PluginCandidate
  }

  pushError(
    errors,
    pluginId,
    `Invalid plugin contract in '${pluginId}'. Expected an object export with shape { name, rules[] }`,
    { code: 'plugin-shape-invalid' },
  )
  return undefined
}

function ensurePluginName(
  pluginId: string,
  plugin: PluginCandidate,
  errors: PluginLoadError[],
): string | undefined {
  const pluginName = typeof plugin.name === 'string' ? plugin.name.trim() : ''
  if (pluginName) return pluginName

  pushError(
    errors,
    pluginId,
    `Invalid plugin contract in '${pluginId}'. Expected 'name' as a non-empty string.`,
    { code: 'plugin-name-missing' },
  )
  return undefined
}

function validateApiVersion(
  plugin: PluginCandidate,
  context: PluginValidationContext,
): { hasExplicitApiVersion: boolean; isLegacyPlugin: boolean; isSupported: boolean } {
  const { pluginId, pluginName, errors, warnings } = context
  const hasExplicitApiVersion = plugin.apiVersion !== undefined
  const isLegacyPlugin = !hasExplicitApiVersion

  if (isLegacyPlugin) {
    pushWarning(
      warnings,
      pluginId,
      `Plugin '${pluginName}' does not declare 'apiVersion'. Assuming ${SUPPORTED_PLUGIN_API_VERSION} for backward compatibility; please add apiVersion: ${SUPPORTED_PLUGIN_API_VERSION}.`,
      { pluginName, code: 'plugin-api-version-implicit' },
    )
    return { hasExplicitApiVersion, isLegacyPlugin, isSupported: true }
  }

  if (typeof plugin.apiVersion !== 'number' || !Number.isInteger(plugin.apiVersion) || plugin.apiVersion <= 0) {
    pushError(
      errors,
      pluginId,
      `Plugin '${pluginName}' has invalid apiVersion '${String(plugin.apiVersion)}'. Expected a positive integer (for example: ${SUPPORTED_PLUGIN_API_VERSION}).`,
      { pluginName, code: 'plugin-api-version-invalid' },
    )
    return { hasExplicitApiVersion, isLegacyPlugin, isSupported: false }
  }

  if (plugin.apiVersion !== SUPPORTED_PLUGIN_API_VERSION) {
    pushError(
      errors,
      pluginId,
      `Plugin '${pluginName}' targets apiVersion ${plugin.apiVersion}, but this drift build supports apiVersion ${SUPPORTED_PLUGIN_API_VERSION}.`,
      { pluginName, code: 'plugin-api-version-unsupported' },
    )
    return { hasExplicitApiVersion, isLegacyPlugin, isSupported: false }
  }

  return { hasExplicitApiVersion, isLegacyPlugin, isSupported: true }
}

function validatePluginContractData(pluginId: string, candidate: unknown): {
  plugin?: DriftPlugin
  errors: PluginLoadError[]
  warnings: PluginLoadWarning[]
} {
  const errors: PluginLoadError[] = []
  const warnings: PluginLoadWarning[] = []

  const plugin = ensureObjectCandidate(pluginId, candidate, errors)
  if (!plugin) return { errors, warnings }

  const pluginName = ensurePluginName(pluginId, plugin, errors)
  if (!pluginName) return { errors, warnings }

  const context: PluginValidationContext = { pluginId, pluginName, errors, warnings }
  const apiVersion = validateApiVersion(plugin, context)
  if (!apiVersion.isSupported) return { errors, warnings }

  const capabilities = validateCapabilities(plugin.capabilities, context)
  if (errors.length > 0) return { errors, warnings }

  const normalizedRules = normalizeRules(plugin.rules, apiVersion.isLegacyPlugin, context)
  if (!normalizedRules) return { errors, warnings }

  return {
    plugin: {
      name: pluginName,
      apiVersion: apiVersion.hasExplicitApiVersion ? plugin.apiVersion as number : SUPPORTED_PLUGIN_API_VERSION,
      capabilities,
      rules: normalizedRules,
    },
    errors,
    warnings,
  }
}

function validatePluginContract(
  pluginId: string,
  candidate: unknown,
): {
  plugin?: DriftPlugin
  errors: PluginLoadError[]
  warnings: PluginLoadWarning[]
} {
  return validatePluginContractData(pluginId, candidate)
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
  warnings: PluginLoadWarning[]
} {
  if (!pluginIds || pluginIds.length === 0) {
    return { plugins: [], errors: [], warnings: [] }
  }

  const loaded: LoadedPlugin[] = []
  const errors: PluginLoadError[] = []
  const warnings: PluginLoadWarning[] = []

  for (const pluginId of pluginIds) {
    const resolved = resolvePluginSpecifier(projectRoot, pluginId)
    try {
      const mod = require(resolved)
      const normalized = normalizePluginExport(mod)
      const validation = validatePluginContract(pluginId, normalized)

      errors.push(...validation.errors)
      warnings.push(...validation.warnings)

      if (!validation.plugin) continue
      loaded.push({ id: pluginId, plugin: validation.plugin })
    } catch (error) {
      errors.push({
        pluginId,
        code: 'plugin-load-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { plugins: loaded, errors, warnings }
}
