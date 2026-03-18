import type {
  IngestOptions,
  SaasPlan,
  SaasPolicy,
  SaasPolicyInput,
  SaasPolicyOverrides,
  SaasQueryOptions,
  SaasRepo,
  SaasRole,
  SaasSnapshot,
  SaasStore,
  SaasWorkspace,
  ScopedIdentity,
} from './types.js'
import {
  ACTIVE_WINDOW_DAYS,
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_SAAS_POLICY,
  ROLE_PRIORITY,
  VALID_PLANS,
  VALID_ROLES,
  daysAgo,
} from './constants.js'

export function resolveSaasPolicy(policy?: SaasPolicyInput): SaasPolicy {
  const customPlanLimits = (policy && 'maxWorkspacesPerOrganizationByPlan' in policy)
    ? (policy.maxWorkspacesPerOrganizationByPlan ?? {})
    : {}

  return {
    ...DEFAULT_SAAS_POLICY,
    ...(policy ?? {}),
    maxWorkspacesPerOrganizationByPlan: {
      ...DEFAULT_SAAS_POLICY.maxWorkspacesPerOrganizationByPlan,
      ...customPlanLimits,
    },
  }
}

export function normalizePlan(plan?: string): SaasPlan {
  if (!plan) return 'free'
  return VALID_PLANS.includes(plan as SaasPlan) ? (plan as SaasPlan) : 'free'
}

export function normalizeRole(role?: string): SaasRole {
  if (!role) return 'member'
  return VALID_ROLES.includes(role as SaasRole) ? (role as SaasRole) : 'member'
}

export function hasRoleAtLeast(role: SaasRole | undefined, requiredRole: SaasRole): boolean {
  if (!role) return false
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[requiredRole]
}

export function workspaceKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}:${workspaceId}`
}

function repoKey(organizationId: string, workspaceId: string, repoName: string): string {
  return `${workspaceKey(organizationId, workspaceId)}:${repoName}`
}

export function membershipKey(organizationId: string, workspaceId: string, userId: string): string {
  return `${workspaceKey(organizationId, workspaceId)}:${userId}`
}

export function monthKey(isoDate: string): string {
  const date = new Date(isoDate)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}`
}

export function resolveScopedIdentity(options: IngestOptions): ScopedIdentity {
  const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID
  const workspaceId = options.workspaceId
  const repoName = options.repoName ?? 'default'
  return {
    organizationId,
    workspaceId,
    workspaceKey: workspaceKey(organizationId, workspaceId),
    repoName,
    repoId: repoKey(organizationId, workspaceId, repoName),
  }
}

export function isWorkspaceActive(workspace: SaasWorkspace): boolean {
  return new Date(workspace.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

export function isRepoActive(repo: SaasRepo): boolean {
  return new Date(repo.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

export function matchesTenantScope(snapshot: SaasSnapshot, options?: SaasQueryOptions): boolean {
  if (!options?.organizationId && !options?.workspaceId) return true
  if (options.organizationId && snapshot.organizationId !== options.organizationId) return false
  if (options.workspaceId && snapshot.workspaceId !== options.workspaceId) return false
  return true
}

export function matchesWorkspaceScope(workspace: SaasWorkspace, options?: SaasQueryOptions): boolean {
  if (options?.organizationId && workspace.organizationId !== options.organizationId) return false
  if (options?.workspaceId && workspace.id !== options.workspaceId) return false
  return true
}

export function matchesRepoScope(repo: SaasRepo, options?: SaasQueryOptions): boolean {
  if (options?.organizationId && repo.organizationId !== options.organizationId) return false
  if (options?.workspaceId && repo.workspaceId !== options.workspaceId) return false
  return true
}

export function computeRunsPerMonth(snapshots: SaasSnapshot[]): Record<string, number> {
  const runsPerMonth: Record<string, number> = {}
  for (const snapshot of snapshots) {
    const key = monthKey(snapshot.createdAt)
    runsPerMonth[key] = (runsPerMonth[key] ?? 0) + 1
  }
  return runsPerMonth
}

export function computeUsersRegistered(store: SaasStore, snapshots: SaasSnapshot[], options?: SaasQueryOptions): number {
  if (!options?.organizationId && !options?.workspaceId) return Object.keys(store.users).length
  return new Set(snapshots.map((snapshot) => snapshot.userId)).size
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function mergePolicy(policy: SaasPolicyOverrides | undefined, base: SaasStore['policy']): SaasPolicy {
  return resolveSaasPolicy({ ...base, ...(policy ?? {}) })
}

export { DEFAULT_ORGANIZATION_ID }
