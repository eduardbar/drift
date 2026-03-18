import type { PluginLoadError, PluginLoadWarning } from './types.js'

type PluginMessageOptions = { pluginName?: string; ruleId?: string; code?: string }

function pushLoadMessage(
  pluginId: string,
  message: string,
  options?: PluginMessageOptions,
): PluginLoadError | PluginLoadWarning {
  return {
    pluginId,
    pluginName: options?.pluginName,
    ruleId: options?.ruleId,
    code: options?.code,
    message,
  }
}

export function pushError(
  errors: PluginLoadError[],
  pluginId: string,
  message: string,
  options?: PluginMessageOptions,
): void {
  errors.push(pushLoadMessage(pluginId, message, options))
}

export function pushWarning(
  warnings: PluginLoadWarning[],
  pluginId: string,
  message: string,
  options?: PluginMessageOptions,
): void {
  warnings.push(pushLoadMessage(pluginId, message, options))
}
