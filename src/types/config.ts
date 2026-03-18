export interface LayerDefinition {
  name: string
  patterns: string[]
  canImportFrom: string[]
}

export interface ModuleBoundary {
  name: string
  root: string
  allowedExternalImports?: string[]
}

export interface DriftPerformanceConfig {
  lowMemory?: boolean
  chunkSize?: number
  maxFiles?: number
  maxFileSizeKb?: number
  includeSemanticDuplication?: boolean
}

export interface DriftAnalysisOptions {
  lowMemory?: boolean
  chunkSize?: number
  maxFiles?: number
  maxFileSizeKb?: number
  includeSemanticDuplication?: boolean
}
