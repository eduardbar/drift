export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface SessionContext {
  projectPath: string
}

export type MCPToolHandler = (args: unknown, ctx: SessionContext) => Promise<unknown>

export interface MCPToolRegistryEntry {
  definition: MCPToolDefinition
  handler: MCPToolHandler
}

export interface MCPToolRegistry {
  [name: string]: MCPToolRegistryEntry
}
