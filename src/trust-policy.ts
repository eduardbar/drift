import type { DriftConfig, MergeRiskLevel, TrustGatePolicyPack, TrustGatePolicyPreset } from './types.js'

export interface TrustGateOptions {
  enabled?: boolean
  minTrust?: number
  maxRisk?: MergeRiskLevel
}

export interface TrustGatePolicyResolutionOptions {
  branchName?: string
  policyPack?: string
  overrides?: TrustGateOptions
}

export interface TrustGatePolicyResolutionStep {
  source: 'base' | 'policy-pack' | 'branch-preset' | 'overrides'
  name: string
  values: TrustGateOptions
}

export interface TrustGatePolicyExplanation {
  effectivePolicy: TrustGateOptions
  branchName?: string
  selectedPolicyPack?: string
  invalidPolicyPack?: string
  steps: TrustGatePolicyResolutionStep[]
}

export const MERGE_RISK_ORDER: MergeRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const BRANCH_ENV_CANDIDATES = [
  'DRIFT_BRANCH',
  'GITHUB_HEAD_REF',
  'GITHUB_REF_NAME',
  'CI_COMMIT_REF_NAME',
  'BRANCH_NAME',
] as const

const PATTERN_EXACT_BOOST = 10_000
const PATTERN_STATIC_CHAR_WEIGHT = 10

function formatTrustGatePolicyValues(values: TrustGateOptions): string {
  const enabled = typeof values.enabled === 'boolean' ? String(values.enabled) : 'inherit'
  const minTrust = typeof values.minTrust === 'number' ? String(values.minTrust) : 'inherit'
  const maxRisk = values.maxRisk ?? 'inherit'
  return `enabled=${enabled} minTrust=${minTrust} maxRisk=${maxRisk}`
}

export function normalizeMergeRiskLevel(value: string): MergeRiskLevel | undefined {
  const normalized = value.toUpperCase()
  return MERGE_RISK_ORDER.find((level) => level === normalized)
}

function branchPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function patternSpecificity(pattern: string): number {
  const wildcardCount = (pattern.match(/\*/g) ?? []).length
  const staticChars = pattern.replace(/\*/g, '').length
  const exactBoost = wildcardCount === 0 ? PATTERN_EXACT_BOOST : 0
  return exactBoost + staticChars * PATTERN_STATIC_CHAR_WEIGHT - wildcardCount
}

function resolvePresetsForBranch(
  branchName: string,
  presets: TrustGatePolicyPreset[] | undefined,
): TrustGatePolicyPreset[] {
  if (!presets || presets.length === 0) return []
  const matched: Array<{ preset: TrustGatePolicyPreset; specificity: number; index: number }> = []

  for (let index = 0; index < presets.length; index += 1) {
    const preset = presets[index]
    if (!preset?.branch) continue

    const regex = branchPatternToRegExp(preset.branch)
    if (!regex.test(branchName)) continue
    matched.push({ preset, specificity: patternSpecificity(preset.branch), index })
  }

  matched.sort((a, b) => a.specificity - b.specificity || a.index - b.index)
  return matched.map((entry) => entry.preset)
}

function normalizeMinTrust(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined
}

function normalizeMaxRisk(value: unknown): MergeRiskLevel | undefined {
  if (typeof value !== 'string') return undefined
  return normalizeMergeRiskLevel(value)
}

function normalizeTrustGateOptions(
  source: { enabled?: unknown; minTrust?: unknown; maxRisk?: unknown } | undefined,
): TrustGateOptions {
  if (!source) return {}

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : undefined,
    minTrust: normalizeMinTrust(source.minTrust),
    maxRisk: normalizeMaxRisk(source.maxRisk),
  }
}

function mergeTrustGateOptions(base: TrustGateOptions, layer: TrustGateOptions): TrustGateOptions {
  return {
    enabled: typeof layer.enabled === 'boolean' ? layer.enabled : base.enabled,
    minTrust: layer.minTrust ?? base.minTrust,
    maxRisk: layer.maxRisk ?? base.maxRisk,
  }
}

function normalizeResolutionOptions(
  branchNameOrOptions?: string | TrustGatePolicyResolutionOptions,
  explicitOverrides?: TrustGateOptions,
): TrustGatePolicyResolutionOptions {
  if (typeof branchNameOrOptions === 'string') {
    return {
      branchName: branchNameOrOptions,
      overrides: explicitOverrides,
    }
  }

  if (!branchNameOrOptions) {
    return { overrides: explicitOverrides }
  }

  return {
    ...branchNameOrOptions,
    overrides: explicitOverrides
      ? mergeTrustGateOptions(normalizeTrustGateOptions(branchNameOrOptions.overrides), normalizeTrustGateOptions(explicitOverrides))
      : branchNameOrOptions.overrides,
  }
}

function resolvePolicyPack(
  policyPacks: Record<string, TrustGatePolicyPack> | undefined,
  policyPackName: string | undefined,
): { name?: string; pack?: TrustGatePolicyPack; invalid?: string } {
  const normalizedName = policyPackName?.trim()
  if (!normalizedName) return {}
  if (!policyPacks) return { name: normalizedName, invalid: normalizedName }

  const pack = policyPacks[normalizedName]
  if (!pack) return { name: normalizedName, invalid: normalizedName }
  return { name: normalizedName, pack }
}

export function detectBranchName(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of BRANCH_ENV_CANDIDATES) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function explainTrustGatePolicy(
  config: DriftConfig | undefined,
  branchName?: string,
  overrides?: TrustGateOptions,
): TrustGatePolicyExplanation
export function explainTrustGatePolicy(
  config: DriftConfig | undefined,
  options?: TrustGatePolicyResolutionOptions,
): TrustGatePolicyExplanation
export function explainTrustGatePolicy(
  config: DriftConfig | undefined,
  branchNameOrOptions?: string | TrustGatePolicyResolutionOptions,
  explicitOverrides?: TrustGateOptions,
): TrustGatePolicyExplanation {
  const policy = config?.trustGate
  const resolution = normalizeResolutionOptions(branchNameOrOptions, explicitOverrides)
  const normalizedBranch = resolution.branchName?.trim()
  const packResolution = resolvePolicyPack(policy?.policyPacks, resolution.policyPack)

  const steps: TrustGatePolicyResolutionStep[] = []
  const base = normalizeTrustGateOptions(policy)
  let effective = base
  steps.push({ source: 'base', name: 'trustGate', values: base })

  if (packResolution.pack) {
    const packOptions = normalizeTrustGateOptions(packResolution.pack)
    effective = mergeTrustGateOptions(effective, packOptions)
    steps.push({ source: 'policy-pack', name: packResolution.name ?? 'unknown', values: packOptions })
  }

  if (normalizedBranch) {
    const matchedPresets = resolvePresetsForBranch(normalizedBranch, policy?.presets)
    for (const preset of matchedPresets) {
      const presetOptions = normalizeTrustGateOptions(preset)
      effective = mergeTrustGateOptions(effective, presetOptions)
      steps.push({ source: 'branch-preset', name: preset.branch, values: presetOptions })
    }
  }

  const normalizedOverrides = normalizeTrustGateOptions(resolution.overrides)
  if (Object.values(normalizedOverrides).some((value) => value !== undefined)) {
    effective = mergeTrustGateOptions(effective, normalizedOverrides)
    steps.push({ source: 'overrides', name: 'cli', values: normalizedOverrides })
  }

  return {
    effectivePolicy: effective,
    branchName: normalizedBranch,
    selectedPolicyPack: packResolution.name,
    invalidPolicyPack: packResolution.invalid,
    steps,
  }
}

export function resolveTrustGatePolicy(
  config: DriftConfig | undefined,
  branchName?: string,
  overrides?: TrustGateOptions,
): TrustGateOptions
export function resolveTrustGatePolicy(
  config: DriftConfig | undefined,
  options?: TrustGatePolicyResolutionOptions,
): TrustGateOptions
export function resolveTrustGatePolicy(
  config: DriftConfig | undefined,
  branchNameOrOptions?: string | TrustGatePolicyResolutionOptions,
  explicitOverrides?: TrustGateOptions,
): TrustGateOptions {
  const options = normalizeResolutionOptions(branchNameOrOptions, explicitOverrides)
  return explainTrustGatePolicy(config, options).effectivePolicy
}

export function formatTrustGatePolicyExplanation(explanation: TrustGatePolicyExplanation): string {
  const lines = ['Trust gate policy resolution:']
  lines.push(`- branch: ${explanation.branchName ?? 'not provided'}`)
  lines.push(`- policy pack: ${explanation.selectedPolicyPack ?? 'not selected'}`)
  if (explanation.invalidPolicyPack) {
    lines.push(`- invalid policy pack: ${explanation.invalidPolicyPack}`)
  }
  lines.push('- steps:')

  for (const [index, step] of explanation.steps.entries()) {
    lines.push(`  ${index + 1}. ${step.source} (${step.name}): ${formatTrustGatePolicyValues(step.values)}`)
  }

  lines.push(`- effective: ${formatTrustGatePolicyValues(explanation.effectivePolicy)}`)
  return lines.join('\n')
}
