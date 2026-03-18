import type { SaasOperation, SaasPermissionContext, SaasRole } from './types.js'

export class SaasPermissionError extends Error {
  readonly code = 'SAAS_PERMISSION_DENIED'
  readonly operation: SaasOperation
  readonly organizationId: string
  readonly workspaceId?: string
  readonly actorUserId?: string
  readonly requiredRole: SaasRole
  readonly actorRole?: SaasRole

  constructor(context: SaasPermissionContext, requiredRole: SaasRole, actorRole?: SaasRole) {
    const actor = context.actorUserId ?? 'unknown-actor'
    const workspaceSuffix = context.workspaceId ? ` workspace='${context.workspaceId}'` : ''
    const actualRole = actorRole ?? 'none'
    super(
      `Permission denied for operation '${context.operation}'. actor='${actor}' organization='${context.organizationId}'${workspaceSuffix} requiredRole='${requiredRole}' actualRole='${actualRole}'.`,
    )
    this.name = 'SaasPermissionError'
    this.operation = context.operation
    this.organizationId = context.organizationId
    this.workspaceId = context.workspaceId
    this.actorUserId = context.actorUserId
    this.requiredRole = requiredRole
    this.actorRole = actorRole
  }
}

export class SaasActorRequiredError extends Error {
  readonly code = 'SAAS_ACTOR_REQUIRED'
  readonly operation: SaasOperation
  readonly organizationId: string
  readonly workspaceId?: string

  constructor(context: SaasPermissionContext) {
    const workspaceSuffix = context.workspaceId ? ` workspace='${context.workspaceId}'` : ''
    super(
      `Actor is required for operation '${context.operation}'. organization='${context.organizationId}'${workspaceSuffix}.`,
    )
    this.name = 'SaasActorRequiredError'
    this.operation = context.operation
    this.organizationId = context.organizationId
    this.workspaceId = context.workspaceId
  }
}
