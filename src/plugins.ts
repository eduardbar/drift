import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { DriftIssue, DriftPlugin, DriftPluginRule, PluginLoadError, PluginLoadWarning, LoadedPlugin } from './types.js'

const require = createRequire(import.meta.url)
const VALID_SEVERITIES: DriftIssue['severity'][] = ['error', 'warning', 'info']
const RULE_ID_RECOMMENDED = /^[a-z0-9]+(?:[-_/][a-z0-9]+)*$/

type PluginCandidate = {
  name?: unknown
  rules?: unknown
}

type RuleCandidate = {
  id?: unknown
  name?: unknown
  severity?: unknown
  weight?: unknown
  detect?: unknown
  fix?: unknown
}

function normalizePluginExport(mod: unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default?: unknown }).default ?? mod
  }
  return mod
}

function pushError(
  errors: PluginLoadError[],
  pluginId: string,
  message: string,
  options?: { pluginName?: string; ruleId?: string; code?: string },
): void {
  errors.push({
    pluginId,
    pluginName: options?.pluginName,
    ruleId: options?.ruleId,
    code: options?.code,
    message,
  })
}

function pushWarning(
  warnings: PluginLoadWarning[],
  pluginId: string,
  message: string,
  options?: { pluginName?: string; ruleId?: string; code?: string },
): void {
  warnings.push({
    pluginId,
    pluginName: options?.pluginName,
    ruleId: options?.ruleId,
    code: options?.code,
    message,
  })
}

function normalizeRule(
  pluginId: string,
  pluginName: string,
  rawRule: RuleCandidate,
  ruleIndex: number,
  errors: PluginLoadError[],
  warnings: PluginLoadWarning[],
): DriftPluginRule | undefined {
  const rawRuleId = typeof rawRule.id === 'string'
    ? rawRule.id.trim()
    : typeof rawRule.name === 'string'
      ? rawRule.name.trim()
      : ''

  const ruleLabel = rawRuleId || `rule#${ruleIndex + 1}`

  if (!rawRuleId) {
    pushError(
      errors,
      pluginId,
      `Invalid rule at index ${ruleIndex}. Expected 'id' or 'name' as a non-empty string.`,
      { pluginName, code: 'plugin-rule-id-missing' },
    )
    return undefined
  }

  if (typeof rawRule.detect !== 'function') {
    pushError(
      errors,
      pluginId,
      `Rule '${rawRuleId}' is invalid. Expected 'detect(file, context)' function.`,
      { pluginName, ruleId: rawRuleId, code: 'plugin-rule-detect-invalid' },
    )
    return undefined
  }

  if (rawRule.detect.length > 2) {
    pushWarning(
      warnings,
      pluginId,
      `Rule '${rawRuleId}' detect() declares ${rawRule.detect.length} parameters. Expected 1-2 parameters (file, context).`,
      { pluginName, ruleId: rawRuleId, code: 'plugin-rule-detect-arity' },
    )
  }

  if (!RULE_ID_RECOMMENDED.test(rawRuleId)) {
    pushWarning(
      warnings,
      pluginId,
      `Rule id '${ruleLabel}' uses a non-recommended format. Use lowercase/kebab-case for better compatibility.`,
      { pluginName, ruleId: rawRuleId, code: 'plugin-rule-id-format' },
    )
  }

  let severity: DriftIssue['severity'] | undefined
  if (rawRule.severity !== undefined) {
    if (typeof rawRule.severity === 'string' && VALID_SEVERITIES.includes(rawRule.severity as DriftIssue['severity'])) {
      severity = rawRule.severity as DriftIssue['severity']
    } else {
      pushError(
        errors,
        pluginId,
        `Rule '${rawRuleId}' has invalid severity '${String(rawRule.severity)}'. Allowed: error, warning, info.`,
        { pluginName, ruleId: rawRuleId, code: 'plugin-rule-severity-invalid' },
      )
    }
  }

  let weight: number | undefined
  if (rawRule.weight !== undefined) {
    if (typeof rawRule.weight === 'number' && Number.isFinite(rawRule.weight) && rawRule.weight >= 0 && rawRule.weight <= 100) {
      weight = rawRule.weight
    } else {
      pushError(
        errors,
        pluginId,
        `Rule '${rawRuleId}' has invalid weight '${String(rawRule.weight)}'. Expected a finite number between 0 and 100.`,
        { pluginName, ruleId: rawRuleId, code: 'plugin-rule-weight-invalid' },
      )
    }
  }

  let fix: DriftPluginRule['fix'] | undefined
  if (rawRule.fix !== undefined) {
    if (typeof rawRule.fix === 'function') {
      fix = rawRule.fix as DriftPluginRule['fix']
      if (rawRule.fix.length > 3) {
        pushWarning(
          warnings,
          pluginId,
          `Rule '${rawRuleId}' fix() declares ${rawRule.fix.length} parameters. Expected up to 3 (issue, file, context).`,
          { pluginName, ruleId: rawRuleId, code: 'plugin-rule-fix-arity' },
        )
      }
    } else {
      pushError(
        errors,
        pluginId,
        `Rule '${rawRuleId}' has invalid fix. Expected a function when provided.`,
        { pluginName, ruleId: rawRuleId, code: 'plugin-rule-fix-invalid' },
      )
    }
  }

  return {
    id: rawRuleId,
    name: rawRuleId,
    detect: rawRule.detect as DriftPluginRule['detect'],
    severity,
    weight,
    fix,
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
  const errors: PluginLoadError[] = []
  const warnings: PluginLoadWarning[] = []

  if (!candidate || typeof candidate !== 'object') {
    pushError(
      errors,
      pluginId,
      `Invalid plugin contract in '${pluginId}'. Expected an object export with shape { name, rules[] }`,
      { code: 'plugin-shape-invalid' },
    )
    return { errors, warnings }
  }

  const plugin = candidate as PluginCandidate
  const pluginName = typeof plugin.name === 'string' ? plugin.name.trim() : ''
  if (!pluginName) {
    pushError(
      errors,
      pluginId,
      `Invalid plugin contract in '${pluginId}'. Expected 'name' as a non-empty string.`,
      { code: 'plugin-name-missing' },
    )
    return { errors, warnings }
  }

  if (!Array.isArray(plugin.rules)) {
    pushError(
      errors,
      pluginId,
      `Invalid plugin '${pluginName}'. Expected 'rules' to be an array.`,
      { pluginName, code: 'plugin-rules-not-array' },
    )
    return { errors, warnings }
  }

  const normalizedRules: DriftPluginRule[] = []

  for (const [ruleIndex, rawRule] of plugin.rules.entries()) {
    if (!rawRule || typeof rawRule !== 'object') {
      pushError(
        errors,
        pluginId,
        `Invalid rule at index ${ruleIndex} in plugin '${pluginName}'. Expected an object.`,
        { pluginName, code: 'plugin-rule-shape-invalid' },
      )
      continue
    }

    const normalized = normalizeRule(pluginId, pluginName, rawRule as RuleCandidate, ruleIndex, errors, warnings)
    if (normalized) {
      normalizedRules.push(normalized)
    }
  }

  if (normalizedRules.length === 0) {
    pushError(
      errors,
      pluginId,
      `Plugin '${pluginName}' has no valid rules after validation.`,
      { pluginName, code: 'plugin-rules-empty' },
    )
    return { errors, warnings }
  }

  return {
    plugin: {
      name: pluginName,
      rules: normalizedRules,
    },
    errors,
    warnings,
  }
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

      if (!validation.plugin) {
        continue
      }

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
