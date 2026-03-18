import type { SourceFile } from 'ts-morph'
import type { DriftConfig } from './app.js'
import type { DriftIssue } from './core.js'

export interface PluginRuleContext {
  projectRoot: string
  filePath: string
  config?: DriftConfig
}

export interface DriftPluginRule {
  id?: string
  name: string
  severity?: DriftIssue['severity']
  weight?: number
  detect: (file: SourceFile, context: PluginRuleContext) => DriftIssue[]
  fix?: (issue: DriftIssue, file: SourceFile, context: PluginRuleContext) => DriftIssue | void
}

export interface DriftPlugin {
  name: string
  apiVersion?: number
  capabilities?: Record<string, string | number | boolean>
  rules: DriftPluginRule[]
}

export interface LoadedPlugin {
  id: string
  plugin: DriftPlugin
}

export interface PluginLoadError {
  pluginId: string
  pluginName?: string
  ruleId?: string
  code?: string
  message: string
}

export interface PluginLoadWarning {
  pluginId: string
  pluginName?: string
  ruleId?: string
  code?: string
  message: string
}
