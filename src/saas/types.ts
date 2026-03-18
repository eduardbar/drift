import type { DriftConfig, DriftReport } from '../types.js'

export interface SaasPolicy {
  freeUserThreshold: number
  maxRunsPerWorkspacePerMonth: number
  maxReposPerWorkspace: number
  retentionDays: number
  strictActorEnforcement: boolean
  maxWorkspacesPerOrganizationByPlan: Record<SaasPlan, number>
}

export type SaasRole = 'owner' | 'member' | 'viewer'
export type SaasPlan = 'free' | 'sponsor' | 'team' | 'business'

export interface SaasUser {
  id: string
  createdAt: string
  lastSeenAt: string
}

export interface SaasOrganization {
  id: string
  plan: SaasPlan
  createdAt: string
  lastSeenAt: string
  workspaceIds: string[]
}

export interface SaasWorkspace {
  id: string
  organizationId: string
  createdAt: string
  lastSeenAt: string
  userIds: string[]
  repoIds: string[]
}

export interface SaasRepo {
  id: string
  organizationId: string
  workspaceId: string
  name: string
  createdAt: string
  lastSeenAt: string
}

export interface SaasMembership {
  id: string
  organizationId: string
  workspaceId: string
  userId: string
  role: SaasRole
  createdAt: string
  lastSeenAt: string
}

export interface SaasPlanChange {
  id: string
  organizationId: string
  fromPlan: SaasPlan
  toPlan: SaasPlan
  changedAt: string
  changedByUserId: string
  reason?: string
}

export interface SaasSnapshot {
  id: string
  createdAt: string
  scannedAt: string
  organizationId: string
  workspaceId: string
  userId: string
  role: SaasRole
  plan: SaasPlan
  repoId: string
  repoName: string
  targetPath: string
  totalScore: number
  totalIssues: number
  totalFiles: number
  summary: {
    errors: number
    warnings: number
    infos: number
  }
}

export interface SaasStore {
  version: number
  policy: SaasPolicy
  users: Record<string, SaasUser>
  organizations: Record<string, SaasOrganization>
  workspaces: Record<string, SaasWorkspace>
  memberships: Record<string, SaasMembership>
  repos: Record<string, SaasRepo>
  snapshots: SaasSnapshot[]
  planChanges: SaasPlanChange[]
}

export type SaasOperation = 'snapshot:write' | 'snapshot:read' | 'summary:read' | 'billing:write' | 'billing:read'

export interface SaasPermissionContext {
  operation: SaasOperation
  organizationId: string
  workspaceId?: string
  actorUserId?: string
}

export interface SaasPermissionResult {
  actorRole?: SaasRole
  requiredRole: SaasRole
}

export interface SaasEffectiveLimits {
  plan: SaasPlan
  maxWorkspaces: number
  maxReposPerWorkspace: number
  maxRunsPerWorkspacePerMonth: number
  retentionDays: number
}

export interface SaasOrganizationUsageSnapshot {
  organizationId: string
  plan: SaasPlan
  capturedAt: string
  workspaceCount: number
  repoCount: number
  runCount: number
  runCountThisMonth: number
}

export interface ChangeOrganizationPlanOptions {
  organizationId: string
  actorUserId: string
  newPlan: SaasPlan
  reason?: string
  storeFile?: string
  policy?: SaasPolicyOverrides
}

export interface SaasUsageQueryOptions {
  organizationId: string
  month?: string
  storeFile?: string
  policy?: SaasPolicyOverrides
  actorUserId?: string
}

export interface SaasPlanChangeQueryOptions {
  organizationId: string
  storeFile?: string
  policy?: SaasPolicyOverrides
  actorUserId?: string
}

export interface SaasSummary {
  policy: SaasPolicy
  usersRegistered: number
  workspacesActive: number
  reposActive: number
  runsPerMonth: Record<string, number>
  totalSnapshots: number
  phase: 'free' | 'paid'
  thresholdReached: boolean
  freeUsersRemaining: number
}

export interface SaasPolicyOverrides {
  freeUserThreshold?: number
  maxRunsPerWorkspacePerMonth?: number
  maxReposPerWorkspace?: number
  retentionDays?: number
  strictActorEnforcement?: boolean
  maxWorkspacesPerOrganizationByPlan?: Partial<Record<SaasPlan, number>>
}

export interface SaasQueryOptions {
  storeFile?: string
  policy?: SaasPolicyOverrides
  organizationId?: string
  workspaceId?: string
  actorUserId?: string
}

export interface IngestOptions {
  organizationId?: string
  workspaceId: string
  userId: string
  role?: SaasRole
  plan?: SaasPlan
  repoName?: string
  actorUserId?: string
  storeFile?: string
  policy?: SaasPolicyOverrides
}

export interface ScopedIdentity {
  organizationId: string
  workspaceId: string
  workspaceKey: string
  repoName: string
  repoId: string
}

export interface IngestMutationContext {
  store: SaasStore
  scoped: ScopedIdentity
  options: IngestOptions
  nowIso: string
  requestedPlan: SaasPlan
}

export type SaasPolicyInput = SaasPolicyOverrides | DriftConfig['saas'] | undefined

export type DriftReportInput = DriftReport
