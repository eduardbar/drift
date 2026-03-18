import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

export const TOOL_VERSION = version

export const OUTPUT_SCHEMA = {
  report: 'schemas/drift-report.v1.json',
  trust: 'schemas/drift-trust.v1.json',
  ai: 'schemas/drift-ai-output.v1.json',
} as const

type OutputMetadata = {
  $schema: string
  toolVersion: string
}

export type JsonOutputWithMetadata<T extends object> = T & OutputMetadata

export function withOutputMetadata<T extends object>(
  payload: T,
  schema: string,
): JsonOutputWithMetadata<T> {
  return {
    ...payload,
    $schema: schema,
    toolVersion: TOOL_VERSION,
  }
}
