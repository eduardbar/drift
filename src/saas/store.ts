import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { SaasEffectiveLimits, SaasOperation, SaasPermissionContext, SaasPermissionResult, SaasPlan, SaasPolicyOverrides, SaasRole, SaasStore, SaasWorkspace } from './types.js'
import { DEFAULT_ORGANIZATION_ID, REQUIRED_ROLE_BY_OPERATION, ROLE_PRIORITY, STORE_VERSION } from './constants.js'
import { SaasActorRequiredError, SaasPermissionError } from './errors.js'
import { hasRoleAtLeast, membershipKey, mergePolicy, normalizePlan, resolveSaasPolicy } from './helpers.js'

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000

export function defaultSaasStorePath(root = '.'): string {
  return resolve(root, '.drift-cloud', 'store.json')
}

function createEmptyStore(policy?: SaasPolicyOverrides): SaasStore {
  return {
    version: STORE_VERSION,
    policy: resolveSaasPolicy(policy),
    users: {},
    organizations: {},
    workspaces: {},
    memberships: {},
    repos: {},
    snapshots: [],
    planChanges: [],
  }
}

function ensureStoreFile(storeFile: string, policy?: SaasPolicyOverrides): void {
  const dir = dirname(storeFile)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(storeFile)) {
    const initial = createEmptyStore(policy)
    writeFileSync(storeFile, JSON.stringify(initial, null, 2), 'utf8')
  }
}

function applyStoreEntityDefaults(store: SaasStore): void {
  for (const workspace of Object.values(store.workspaces)) {
    if (!workspace.organizationId) workspace.organizationId = DEFAULT_ORGANIZATION_ID
  }
  for (const repo of Object.values(store.repos)) {
    if (!repo.organizationId) repo.organizationId = DEFAULT_ORGANIZATION_ID
  }
  for (const snapshot of store.snapshots) {
    if (!snapshot.organizationId) snapshot.organizationId = DEFAULT_ORGANIZATION_ID
    if (!snapshot.plan) snapshot.plan = 'free'
    if (!snapshot.role) snapshot.role = 'member'
  }
}

function ensureOrganizationFromWorkspace(store: SaasStore, workspace: SaasWorkspace): void {
  const orgId = workspace.organizationId
  const existingOrg = store.organizations[orgId]

  if (!existingOrg) {
    store.organizations[orgId] = {
      id: orgId,
      plan: 'free',
      createdAt: workspace.createdAt,
      lastSeenAt: workspace.lastSeenAt,
      workspaceIds: [workspace.id],
    }
    return
  }

  if (!existingOrg.workspaceIds.includes(workspace.id)) existingOrg.workspaceIds.push(workspace.id)
  if (workspace.lastSeenAt > existingOrg.lastSeenAt) existingOrg.lastSeenAt = workspace.lastSeenAt
}

function hydrateOrganizationsFromWorkspaces(store: SaasStore): void {
  for (const workspace of Object.values(store.workspaces)) {
    ensureOrganizationFromWorkspace(store, workspace)
  }
}

export function applyRetentionPolicy(store: SaasStore): void {
  const millisecondsPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
  const cutoff = Date.now() - store.policy.retentionDays * millisecondsPerDay
  store.snapshots = store.snapshots.filter((snapshot) => new Date(snapshot.createdAt).getTime() >= cutoff)
}

export function saveStore(storeFile: string, store: SaasStore): void {
  writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8')
}

export function loadStoreInternal(storeFile: string, policy?: SaasPolicyOverrides): SaasStore {
  ensureStoreFile(storeFile, policy)
  const raw = readFileSync(storeFile, 'utf8')
  const parsed = JSON.parse(raw) as Partial<SaasStore>

  const merged = createEmptyStore(parsed.policy)
  merged.version = parsed.version ?? STORE_VERSION
  merged.users = parsed.users ?? {}
  merged.organizations = parsed.organizations ?? {}
  merged.workspaces = parsed.workspaces ?? {}
  merged.memberships = parsed.memberships ?? {}
  merged.repos = parsed.repos ?? {}
  merged.snapshots = parsed.snapshots ?? []
  merged.planChanges = parsed.planChanges ?? []
  merged.policy = mergePolicy(policy, merged.policy)

  applyStoreEntityDefaults(merged)
  hydrateOrganizationsFromWorkspaces(merged)
  applyRetentionPolicy(merged)

  return merged
}

function resolveActorRole(store: SaasStore, organizationId: string, actorUserId: string, workspaceId?: string): SaasRole | undefined {
  if (workspaceId) {
    const scopedMembershipId = membershipKey(organizationId, workspaceId, actorUserId)
    return store.memberships[scopedMembershipId]?.role
  }

  let highestRole: SaasRole | undefined
  for (const membership of Object.values(store.memberships)) {
    if (membership.organizationId !== organizationId) continue
    if (membership.userId !== actorUserId) continue
    if (!highestRole || ROLE_PRIORITY[membership.role] > ROLE_PRIORITY[highestRole]) highestRole = membership.role
    if (highestRole === 'owner') break
  }
  return highestRole
}

export function assertPermissionInStore(store: SaasStore, context: SaasPermissionContext): SaasPermissionResult {
  const requiredRole = REQUIRED_ROLE_BY_OPERATION[context.operation]
  if (!context.actorUserId) {
    if (store.policy.strictActorEnforcement) throw new SaasActorRequiredError(context)
    return { requiredRole }
  }

  const actorRole = resolveActorRole(store, context.organizationId, context.actorUserId, context.workspaceId)
  if (!hasRoleAtLeast(actorRole, requiredRole)) {
    throw new SaasPermissionError(context, requiredRole, actorRole)
  }

  return { requiredRole, actorRole }
}

export function getRequiredRoleForOperation(operation: SaasOperation): SaasRole {
  return REQUIRED_ROLE_BY_OPERATION[operation]
}

export function assertSaasPermission(
  context: SaasPermissionContext & { storeFile?: string; policy?: SaasPolicyOverrides },
): SaasPermissionResult {
  const storeFile = resolve(context.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, context.policy)
  return assertPermissionInStore(store, context)
}

export function getSaasEffectiveLimits(input: { plan: SaasPlan; policy?: SaasPolicyOverrides }): SaasEffectiveLimits {
  const policy = resolveSaasPolicy(input.policy)
  const plan = normalizePlan(input.plan)
  return {
    plan,
    maxWorkspaces: policy.maxWorkspacesPerOrganizationByPlan[plan],
    maxReposPerWorkspace: policy.maxReposPerWorkspace,
    maxRunsPerWorkspacePerMonth: policy.maxRunsPerWorkspacePerMonth,
    retentionDays: policy.retentionDays,
  }
}

export function getOrganizationEffectiveLimits(options: { organizationId: string; storeFile?: string; policy?: SaasPolicyOverrides }): SaasEffectiveLimits {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const plan = normalizePlan(store.organizations[options.organizationId]?.plan)
  return getSaasEffectiveLimits({ plan, policy: store.policy })
}
