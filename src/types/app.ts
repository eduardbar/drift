import type { DriftPerformanceConfig, LayerDefinition, ModuleBoundary } from './config.js'
import type { TrustGatePolicyConfig } from './trust.js'

export interface DriftConfig {
  layers?: LayerDefinition[]
  modules?: ModuleBoundary[]
  moduleBoundaries?: ModuleBoundary[]
  boundaries?: ModuleBoundary[]
  plugins?: string[]
  performance?: DriftPerformanceConfig
  architectureRules?: {
    controllerNoDb?: boolean
    serviceNoHttp?: boolean
    maxFunctionLines?: number
  }
  saas?: {
    freeUserThreshold?: number
    maxRunsPerWorkspacePerMonth?: number
    maxReposPerWorkspace?: number
    retentionDays?: number
    strictActorEnforcement?: boolean
    maxWorkspacesPerOrganizationByPlan?: {
      free?: number
      sponsor?: number
      team?: number
      business?: number
    }
  }
  trustGate?: TrustGatePolicyConfig
  aiIntegration?: {
    contextOutput?: string
    maxIssues?: number
  }
  aiGuard?: {
    budget?: number
    blockOnRules?: string[]
  }
}
