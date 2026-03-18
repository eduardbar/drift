import type { DriftIssue, DriftPluginRule, PluginLoadError, PluginLoadWarning } from './types.js'
import { pushError, pushWarning } from './plugins-messages.js'

const VALID_SEVERITIES: DriftIssue['severity'][] = ['error', 'warning', 'info']
const MAX_FIX_ARITY = 3
const RULE_ID_REQUIRED = /^[a-z][a-z0-9]*(?:[-_/][a-z0-9]+)*$/

type RuleCandidate = {
  id?: unknown
  name?: unknown
  severity?: unknown
  weight?: unknown
  detect?: unknown
  fix?: unknown
}

type NormalizeRuleContext = {
  pluginId: string
  pluginName: string
  ruleIndex: number
  strictRuleId: boolean
  errors: PluginLoadError[]
  warnings: PluginLoadWarning[]
}

type RuleValidationContext = {
  pluginId: string
  pluginName: string
  ruleId: string
  errors: PluginLoadError[]
}

type RuleMessageContext = {
  pluginId: string
  pluginName: string
  ruleId: string
  errors: PluginLoadError[]
  warnings: PluginLoadWarning[]
}

export type PluginValidationContext = {
  pluginId: string
  pluginName: string
  errors: PluginLoadError[]
  warnings: PluginLoadWarning[]
}

function resolveRawRuleId(rawRule: RuleCandidate): string {
  if (typeof rawRule.id === 'string') return rawRule.id.trim()
  if (typeof rawRule.name === 'string') return rawRule.name.trim()
  return ''
}

function ensureRuleId(
  rawRuleId: string,
  ruleIndex: number,
  context: RuleMessageContext,
): boolean {
  if (rawRuleId) return true

  pushError(
    context.errors,
    context.pluginId,
    `Invalid rule at index ${ruleIndex}. Expected 'id' or 'name' as a non-empty string.`,
    { pluginName: context.pluginName, code: 'plugin-rule-id-missing' },
  )
  return false
}

function ensureDetectFunction(
  detect: unknown,
  context: RuleMessageContext,
): detect is DriftPluginRule['detect'] {
  if (typeof detect === 'function') return true

  pushError(
    context.errors,
    context.pluginId,
    `Rule '${context.ruleId}' is invalid. Expected 'detect(file, context)' function.`,
    { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-detect-invalid' },
  )
  return false
}

function warnDetectArity(
  detect: DriftPluginRule['detect'],
  context: RuleMessageContext,
): void {
  if (detect.length <= 2) return

  pushWarning(
    context.warnings,
    context.pluginId,
    `Rule '${context.ruleId}' detect() declares ${detect.length} parameters. Expected 1-2 parameters (file, context).`,
    { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-detect-arity' },
  )
}

function validateRuleIdentifierFormat(
  rawRuleId: string,
  strictRuleId: boolean,
  context: RuleMessageContext,
): void {
  if (RULE_ID_REQUIRED.test(rawRuleId)) return
  const ruleLabel = rawRuleId || 'unknown-rule'

  if (strictRuleId) {
    pushError(
      context.errors,
      context.pluginId,
      `Rule id '${ruleLabel}' is invalid. Use lowercase letters, numbers, and separators (-, _, /), starting with a letter.`,
      { pluginName: context.pluginName, ruleId: rawRuleId, code: 'plugin-rule-id-invalid' },
    )
    return
  }

  pushWarning(
    context.warnings,
    context.pluginId,
    `Rule id '${ruleLabel}' uses a legacy format. For forward compatibility, migrate to lowercase kebab-case and set apiVersion: 1.`,
    { pluginName: context.pluginName, ruleId: rawRuleId, code: 'plugin-rule-id-format-legacy' },
  )
}

function resolveRuleSeverity(
  rawSeverity: unknown,
  context: RuleValidationContext,
): DriftIssue['severity'] | undefined {
  if (rawSeverity === undefined) return undefined
  if (typeof rawSeverity === 'string' && VALID_SEVERITIES.includes(rawSeverity as DriftIssue['severity'])) {
    return rawSeverity as DriftIssue['severity']
  }

  pushError(
    context.errors,
    context.pluginId,
    `Rule '${context.ruleId}' has invalid severity '${String(rawSeverity)}'. Allowed: error, warning, info.`,
    { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-severity-invalid' },
  )
  return undefined
}

function resolveRuleWeight(rawWeight: unknown, context: RuleValidationContext): number | undefined {
  if (rawWeight === undefined) return undefined
  if (typeof rawWeight === 'number' && Number.isFinite(rawWeight) && rawWeight >= 0 && rawWeight <= 100) {
    return rawWeight
  }

  pushError(
    context.errors,
    context.pluginId,
    `Rule '${context.ruleId}' has invalid weight '${String(rawWeight)}'. Expected a finite number between 0 and 100.`,
    { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-weight-invalid' },
  )
  return undefined
}

function resolveRuleFix(
  rawFix: unknown,
  context: RuleMessageContext,
): DriftPluginRule['fix'] | undefined {
  if (rawFix === undefined) return undefined
  if (typeof rawFix !== 'function') {
    pushError(
      context.errors,
      context.pluginId,
      `Rule '${context.ruleId}' has invalid fix. Expected a function when provided.`,
      { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-fix-invalid' },
    )
    return undefined
  }

  if (rawFix.length > MAX_FIX_ARITY) {
    pushWarning(
      context.warnings,
      context.pluginId,
      `Rule '${context.ruleId}' fix() declares ${rawFix.length} parameters. Expected up to ${MAX_FIX_ARITY} (issue, file, context).`,
      { pluginName: context.pluginName, ruleId: context.ruleId, code: 'plugin-rule-fix-arity' },
    )
  }

  return rawFix as DriftPluginRule['fix']
}

function normalizeRule(
  rawRule: RuleCandidate,
  context: NormalizeRuleContext,
): DriftPluginRule | undefined {
  const { pluginId, pluginName, ruleIndex, strictRuleId, errors, warnings } = context
  const rawRuleId = resolveRawRuleId(rawRule)
  const messageContext = { pluginId, pluginName, ruleId: rawRuleId, errors, warnings }
  if (!ensureRuleId(rawRuleId, ruleIndex, messageContext)) return undefined
  if (!ensureDetectFunction(rawRule.detect, messageContext)) return undefined

  validateRuleIdentifierFormat(rawRuleId, strictRuleId, messageContext)
  warnDetectArity(rawRule.detect, messageContext)
  const ruleValidationContext: RuleValidationContext = { pluginId, pluginName, ruleId: rawRuleId, errors }
  const severity = resolveRuleSeverity(rawRule.severity, ruleValidationContext)
  const weight = resolveRuleWeight(rawRule.weight, ruleValidationContext)
  const fix = resolveRuleFix(rawRule.fix, messageContext)

  return {
    id: rawRuleId,
    name: rawRuleId,
    detect: rawRule.detect as DriftPluginRule['detect'],
    severity,
    weight,
    fix,
  }
}

function ensureUniqueRuleId(
  rule: DriftPluginRule,
  seenRuleIds: Set<string>,
  context: PluginValidationContext,
): boolean {
  const normalizedRuleId = rule.id ?? rule.name
  if (seenRuleIds.has(normalizedRuleId)) {
    pushError(
      context.errors,
      context.pluginId,
      `Plugin '${context.pluginName}' defines duplicate rule id '${normalizedRuleId}'. Rule ids must be unique within a plugin.`,
      { pluginName: context.pluginName, ruleId: normalizedRuleId, code: 'plugin-rule-id-duplicate' },
    )
    return false
  }

  seenRuleIds.add(normalizedRuleId)
  return true
}

function normalizeRulesArray(
  rulesCandidate: unknown[],
  context: PluginValidationContext,
  strictRuleId: boolean,
): DriftPluginRule[] {
  const normalizedRules: DriftPluginRule[] = []
  const seenRuleIds = new Set<string>()

  for (const [ruleIndex, rawRule] of rulesCandidate.entries()) {
    if (!rawRule || typeof rawRule !== 'object') {
      pushError(
        context.errors,
        context.pluginId,
        `Invalid rule at index ${ruleIndex} in plugin '${context.pluginName}'. Expected an object.`,
        { pluginName: context.pluginName, code: 'plugin-rule-shape-invalid' },
      )
      continue
    }

    const normalized = normalizeRule(rawRule as RuleCandidate, {
      pluginId: context.pluginId,
      pluginName: context.pluginName,
      ruleIndex,
      strictRuleId,
      errors: context.errors,
      warnings: context.warnings,
    })

    if (!normalized) continue
    if (ensureUniqueRuleId(normalized, seenRuleIds, context)) {
      normalizedRules.push(normalized)
    }
  }

  return normalizedRules
}

export function normalizeRules(
  rulesCandidate: unknown,
  isLegacyPlugin: boolean,
  context: PluginValidationContext,
): DriftPluginRule[] | undefined {
  if (!Array.isArray(rulesCandidate)) {
    pushError(
      context.errors,
      context.pluginId,
      `Invalid plugin '${context.pluginName}'. Expected 'rules' to be an array.`,
      { pluginName: context.pluginName, code: 'plugin-rules-not-array' },
    )
    return undefined
  }

  const normalizedRules = normalizeRulesArray(rulesCandidate, context, !isLegacyPlugin)
  if (normalizedRules.length === 0) {
    pushError(
      context.errors,
      context.pluginId,
      `Plugin '${context.pluginName}' has no valid rules after validation.`,
      { pluginName: context.pluginName, code: 'plugin-rules-empty' },
    )
    return undefined
  }

  return normalizedRules
}
