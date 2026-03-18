import type { DriftPlugin } from './types.js'
import type { PluginValidationContext } from './plugins-rules.js'
import { pushError } from './plugins-messages.js'

export function validateCapabilities(
  capabilitiesCandidate: unknown,
  context: PluginValidationContext,
): DriftPlugin['capabilities'] | undefined {
  const { pluginId, pluginName, errors } = context
  if (capabilitiesCandidate === undefined) return undefined
  if (!capabilitiesCandidate || typeof capabilitiesCandidate !== 'object' || Array.isArray(capabilitiesCandidate)) {
    pushError(
      errors,
      pluginId,
      `Plugin '${pluginName}' has invalid capabilities metadata. Expected an object map like { "fixes": true } when provided.`,
      { pluginName, code: 'plugin-capabilities-invalid' },
    )
    return undefined
  }

  const entries = Object.entries(capabilitiesCandidate as Record<string, unknown>)
  for (const [capabilityKey, capabilityValue] of entries) {
    const capabilityType = typeof capabilityValue
    if (capabilityType !== 'string' && capabilityType !== 'number' && capabilityType !== 'boolean') {
      pushError(
        errors,
        pluginId,
        `Plugin '${pluginName}' capability '${capabilityKey}' has invalid value type '${capabilityType}'. Allowed: string | number | boolean.`,
        { pluginName, code: 'plugin-capabilities-value-invalid' },
      )
    }
  }

  if (errors.length > 0) return undefined
  return capabilitiesCandidate as DriftPlugin['capabilities']
}
