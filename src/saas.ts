import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { DriftReport, DriftConfig } from './types.js'

export interface SaasPolicy {
  freeUserThreshold: number
  maxRunsPerWorkspacePerMonth: number
  maxReposPerWorkspace: number
  retentionDays: number
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

const STORE_VERSION = 3
const ACTIVE_WINDOW_DAYS = 30
const DEFAULT_ORGANIZATION_ID = 'default-org'
const VALID_ROLES: SaasRole[] = ['owner', 'member', 'viewer']
const VALID_PLANS: SaasPlan[] = ['free', 'sponsor', 'team', 'business']
const ROLE_PRIORITY: Record<SaasRole, number> = { viewer: 1, member: 2, owner: 3 }
const REQUIRED_ROLE_BY_OPERATION: Record<SaasOperation, SaasRole> = {
  'snapshot:write': 'member',
  'snapshot:read': 'viewer',
  'summary:read': 'viewer',
  'billing:write': 'owner',
  'billing:read': 'viewer',
}

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

export const DEFAULT_SAAS_POLICY: SaasPolicy = {
  freeUserThreshold: 7500,
  maxRunsPerWorkspacePerMonth: 500,
  maxReposPerWorkspace: 20,
  retentionDays: 90,
  maxWorkspacesPerOrganizationByPlan: {
    free: 20,
    sponsor: 50,
    team: 200,
    business: 1000,
  },
}

export function resolveSaasPolicy(policy?: SaasPolicyOverrides | DriftConfig['saas']): SaasPolicy {
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

export function defaultSaasStorePath(root = '.'): string {
  return resolve(root, '.drift-cloud', 'store.json')
}

function ensureStoreFile(storeFile: string, policy?: SaasPolicyOverrides): void {
  const dir = dirname(storeFile)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(storeFile)) {
    const initial = createEmptyStore(policy)
    writeFileSync(storeFile, JSON.stringify(initial, null, 2), 'utf8')
  }
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

function normalizePlan(plan?: string): SaasPlan {
  if (!plan) return 'free'
  return VALID_PLANS.includes(plan as SaasPlan) ? (plan as SaasPlan) : 'free'
}

function normalizeRole(role?: string): SaasRole {
  if (!role) return 'member'
  return VALID_ROLES.includes(role as SaasRole) ? (role as SaasRole) : 'member'
}

function hasRoleAtLeast(role: SaasRole | undefined, requiredRole: SaasRole): boolean {
  if (!role) return false
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[requiredRole]
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
    if (!highestRole || ROLE_PRIORITY[membership.role] > ROLE_PRIORITY[highestRole]) {
      highestRole = membership.role
      if (highestRole === 'owner') break
    }
  }
  return highestRole
}

function assertPermissionInStore(store: SaasStore, context: SaasPermissionContext): SaasPermissionResult {
  const requiredRole = REQUIRED_ROLE_BY_OPERATION[context.operation]
  if (!context.actorUserId) {
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

export function assertSaasPermission(context: SaasPermissionContext & { storeFile?: string; policy?: SaasPolicyOverrides }): SaasPermissionResult {
  const storeFile = resolve(context.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, context.policy)
  return assertPermissionInStore(store, context)
}

export function getSaasEffectiveLimits(input: { plan: SaasPlan; policy?: SaasPolicyOverrides }): SaasEffectiveLimits {
  const policy = resolveSaasPolicy(input.policy)
  return {
    plan: input.plan,
    maxWorkspaces: policy.maxWorkspacesPerOrganizationByPlan[input.plan],
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

function workspaceKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}:${workspaceId}`
}

function repoKey(organizationId: string, workspaceId: string, repoName: string): string {
  return `${workspaceKey(organizationId, workspaceId)}:${repoName}`
}

function membershipKey(organizationId: string, workspaceId: string, userId: string): string {
  return `${workspaceKey(organizationId, workspaceId)}:${userId}`
}

function monthKey(isoDate: string): string {
  const date = new Date(isoDate)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}`
}

function daysAgo(days: number): number {
  const now = Date.now()
  return now - days * 24 * 60 * 60 * 1000
}

function applyRetention(store: SaasStore): void {
  const cutoff = daysAgo(store.policy.retentionDays)
  store.snapshots = store.snapshots.filter((snapshot) => {
    return new Date(snapshot.createdAt).getTime() >= cutoff
  })
}

function saveStore(storeFile: string, store: SaasStore): void {
  writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8')
}

function loadStoreInternal(storeFile: string, policy?: SaasPolicyOverrides): SaasStore {
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
  merged.policy = resolveSaasPolicy({ ...merged.policy, ...policy })

  for (const workspace of Object.values(merged.workspaces)) {
    if (!workspace.organizationId) workspace.organizationId = DEFAULT_ORGANIZATION_ID
  }
  for (const repo of Object.values(merged.repos)) {
    if (!repo.organizationId) repo.organizationId = DEFAULT_ORGANIZATION_ID
  }
  for (const snapshot of merged.snapshots) {
    if (!snapshot.organizationId) snapshot.organizationId = DEFAULT_ORGANIZATION_ID
    if (!snapshot.plan) snapshot.plan = 'free'
    if (!snapshot.role) snapshot.role = 'member'
  }

  for (const workspace of Object.values(merged.workspaces)) {
    const orgId = workspace.organizationId
    const existingOrg = merged.organizations[orgId]
    if (!existingOrg) {
      merged.organizations[orgId] = {
        id: orgId,
        plan: 'free',
        createdAt: workspace.createdAt,
        lastSeenAt: workspace.lastSeenAt,
        workspaceIds: [workspace.id],
      }
      continue
    }
    if (!existingOrg.workspaceIds.includes(workspace.id)) existingOrg.workspaceIds.push(workspace.id)
    if (workspace.lastSeenAt > existingOrg.lastSeenAt) existingOrg.lastSeenAt = workspace.lastSeenAt
  }

  applyRetention(merged)

  return merged
}

function isWorkspaceActive(workspace: SaasWorkspace): boolean {
  return new Date(workspace.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

function isRepoActive(repo: SaasRepo): boolean {
  return new Date(repo.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

function resolveScopedIdentity(options: IngestOptions): {
  organizationId: string
  workspaceId: string
  workspaceKey: string
  repoName: string
  repoId: string
} {
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

function assertGuardrails(store: SaasStore, options: IngestOptions, nowIso: string): void {
  const scoped = resolveScopedIdentity(options)
  const organization = store.organizations[scoped.organizationId]
  const effectivePlan = normalizePlan(options.plan ?? organization?.plan)
  const workspaceLimit = store.policy.maxWorkspacesPerOrganizationByPlan[effectivePlan]
  const workspaceExists = Boolean(store.workspaces[scoped.workspaceKey])
  const workspaceCount = organization?.workspaceIds.length ?? 0
  if (!workspaceExists && workspaceCount >= workspaceLimit) {
    throw new Error(`Organization '${scoped.organizationId}' on plan '${effectivePlan}' reached max workspaces (${workspaceLimit}).`)
  }

  const usersRegistered = Object.keys(store.users).length
  const isFreePhase = usersRegistered < store.policy.freeUserThreshold
  if (!isFreePhase) return

  if (!store.users[options.userId] && usersRegistered + 1 > store.policy.freeUserThreshold) {
    throw new Error(`Free threshold reached (${store.policy.freeUserThreshold} users).`) 
  }

  const workspace = store.workspaces[scoped.workspaceKey]
  const repoExists = Boolean(store.repos[scoped.repoId])
  const repoCount = workspace?.repoIds.length ?? 0

  if (!repoExists && repoCount >= store.policy.maxReposPerWorkspace) {
    throw new Error(`Workspace '${scoped.workspaceId}' reached max repos (${store.policy.maxReposPerWorkspace}).`)
  }

  const currentMonth = monthKey(nowIso)
  const runsThisMonth = store.snapshots.filter((snapshot) => {
    return (
      snapshot.organizationId === scoped.organizationId
      && snapshot.workspaceId === scoped.workspaceId
      && monthKey(snapshot.createdAt) === currentMonth
    )
  }).length

  if (runsThisMonth >= store.policy.maxRunsPerWorkspacePerMonth) {
    throw new Error(`Workspace '${scoped.workspaceId}' reached max monthly runs (${store.policy.maxRunsPerWorkspacePerMonth}).`)
  }
}

function appendPlanChange(
  store: SaasStore,
  input: { organizationId: string; fromPlan: SaasPlan; toPlan: SaasPlan; changedByUserId: string; reason?: string; changedAt: string },
): SaasPlanChange {
  const change: SaasPlanChange = {
    id: `${input.changedAt}-${Math.random().toString(16).slice(2, 10)}`,
    organizationId: input.organizationId,
    fromPlan: input.fromPlan,
    toPlan: input.toPlan,
    changedAt: input.changedAt,
    changedByUserId: input.changedByUserId,
    reason: input.reason,
  }
  store.planChanges.push(change)
  return change
}

export function changeOrganizationPlan(options: ChangeOrganizationPlanOptions): SaasPlanChange {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const nowIso = new Date().toISOString()

  const organization = store.organizations[options.organizationId]
  if (!organization) {
    throw new Error(`Organization '${options.organizationId}' does not exist.`)
  }

  assertPermissionInStore(store, {
    operation: 'billing:write',
    organizationId: options.organizationId,
    actorUserId: options.actorUserId,
  })

  const nextPlan = normalizePlan(options.newPlan)
  if (organization.plan === nextPlan) {
    const unchanged = appendPlanChange(store, {
      organizationId: organization.id,
      fromPlan: organization.plan,
      toPlan: nextPlan,
      changedAt: nowIso,
      changedByUserId: options.actorUserId,
      reason: options.reason,
    })
    saveStore(storeFile, store)
    return unchanged
  }

  const previousPlan = organization.plan
  organization.plan = nextPlan
  organization.lastSeenAt = nowIso
  const change = appendPlanChange(store, {
    organizationId: organization.id,
    fromPlan: previousPlan,
    toPlan: nextPlan,
    changedAt: nowIso,
    changedByUserId: options.actorUserId,
    reason: options.reason,
  })
  saveStore(storeFile, store)
  return change
}

export function listOrganizationPlanChanges(options: SaasPlanChangeQueryOptions): SaasPlanChange[] {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)

  assertPermissionInStore(store, {
    operation: 'billing:read',
    organizationId: options.organizationId,
    actorUserId: options.actorUserId,
  })

  return store.planChanges
    .filter((change) => change.organizationId === options.organizationId)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
}

export function getOrganizationUsageSnapshot(options: SaasUsageQueryOptions): SaasOrganizationUsageSnapshot {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)

  assertPermissionInStore(store, {
    operation: 'billing:read',
    organizationId: options.organizationId,
    actorUserId: options.actorUserId,
  })

  const organization = store.organizations[options.organizationId]
  if (!organization) {
    throw new Error(`Organization '${options.organizationId}' does not exist.`)
  }

  const month = options.month ?? monthKey(new Date().toISOString())
  const organizationRunSnapshots = store.snapshots.filter((snapshot) => snapshot.organizationId === options.organizationId)

  return {
    organizationId: options.organizationId,
    plan: organization.plan,
    capturedAt: new Date().toISOString(),
    workspaceCount: organization.workspaceIds.length,
    repoCount: organization.workspaceIds
      .map((workspaceId) => store.workspaces[workspaceKey(options.organizationId, workspaceId)])
      .filter((workspace): workspace is SaasWorkspace => Boolean(workspace))
      .reduce((count, workspace) => count + workspace.repoIds.length, 0),
    runCount: organizationRunSnapshots.length,
    runCountThisMonth: organizationRunSnapshots.filter((snapshot) => monthKey(snapshot.createdAt) === month).length,
  }
}

export function ingestSnapshotFromReport(report: DriftReport, options: IngestOptions): SaasSnapshot {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const nowIso = new Date().toISOString()
  const scoped = resolveScopedIdentity(options)
  const requestedPlan = normalizePlan(options.plan)

  const workspaceExists = Boolean(store.workspaces[scoped.workspaceKey])
  const organizationExists = Boolean(store.organizations[scoped.organizationId])
  if (options.actorUserId) {
    if (workspaceExists) {
      assertPermissionInStore(store, {
        operation: 'snapshot:write',
        organizationId: scoped.organizationId,
        workspaceId: scoped.workspaceId,
        actorUserId: options.actorUserId,
      })
    } else if (organizationExists) {
      assertPermissionInStore(store, {
        operation: 'billing:write',
        organizationId: scoped.organizationId,
        actorUserId: options.actorUserId,
      })
    }
  }

  assertGuardrails(store, options, nowIso)

  const user = store.users[options.userId]
  if (user) {
    user.lastSeenAt = nowIso
  } else {
    store.users[options.userId] = {
      id: options.userId,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    }
  }

  const existingOrg = store.organizations[scoped.organizationId]
  const plan = normalizePlan(existingOrg?.plan ?? requestedPlan)

  if (existingOrg) {
    existingOrg.lastSeenAt = nowIso
    if (options.plan && existingOrg.plan !== requestedPlan) {
      if (options.actorUserId) {
        assertPermissionInStore(store, {
          operation: 'billing:write',
          organizationId: scoped.organizationId,
          actorUserId: options.actorUserId,
        })
      }
      const previousPlan = existingOrg.plan
      existingOrg.plan = requestedPlan
      appendPlanChange(store, {
        organizationId: scoped.organizationId,
        fromPlan: previousPlan,
        toPlan: requestedPlan,
        changedAt: nowIso,
        changedByUserId: options.actorUserId ?? options.userId,
        reason: 'ingest-option-plan-change',
      })
    }
  } else {
    store.organizations[scoped.organizationId] = {
      id: scoped.organizationId,
      plan,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      workspaceIds: [],
    }
  }

  const workspace = store.workspaces[scoped.workspaceKey]
  if (workspace) {
    workspace.lastSeenAt = nowIso
    if (!workspace.userIds.includes(options.userId)) workspace.userIds.push(options.userId)
  } else {
    store.workspaces[scoped.workspaceKey] = {
      id: scoped.workspaceId,
      organizationId: scoped.organizationId,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      userIds: [options.userId],
      repoIds: [],
    }
    const org = store.organizations[scoped.organizationId]
    if (!org.workspaceIds.includes(scoped.workspaceId)) org.workspaceIds.push(scoped.workspaceId)
  }

  const membershipId = membershipKey(scoped.organizationId, scoped.workspaceId, options.userId)
  const membership = store.memberships[membershipId]
  let role = normalizeRole(options.role)
  if (!membership && !workspace) role = 'owner'
  if (membership) {
    membership.lastSeenAt = nowIso
    if (options.role) membership.role = normalizeRole(options.role)
    role = membership.role
  } else {
    store.memberships[membershipId] = {
      id: membershipId,
      organizationId: scoped.organizationId,
      workspaceId: scoped.workspaceId,
      userId: options.userId,
      role,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    }
  }

  const repo = store.repos[scoped.repoId]
  if (repo) {
    repo.lastSeenAt = nowIso
  } else {
    store.repos[scoped.repoId] = {
      id: scoped.repoId,
      organizationId: scoped.organizationId,
      workspaceId: scoped.workspaceId,
      name: scoped.repoName,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    }
    const ws = store.workspaces[scoped.workspaceKey]
    if (!ws.repoIds.includes(scoped.repoId)) ws.repoIds.push(scoped.repoId)
  }

  const snapshot: SaasSnapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: nowIso,
    scannedAt: report.scannedAt,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    userId: options.userId,
    role,
    plan: normalizePlan(store.organizations[scoped.organizationId]?.plan ?? requestedPlan),
    repoId: scoped.repoId,
    repoName: scoped.repoName,
    targetPath: report.targetPath,
    totalScore: report.totalScore,
    totalIssues: report.totalIssues,
    totalFiles: report.totalFiles,
    summary: {
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      infos: report.summary.infos,
    },
  }

  store.snapshots.push(snapshot)
  applyRetention(store)
  saveStore(storeFile, store)

  return snapshot
}

function matchesTenantScope(snapshot: SaasSnapshot, options?: SaasQueryOptions): boolean {
  if (!options?.organizationId && !options?.workspaceId) return true
  if (options.organizationId && snapshot.organizationId !== options.organizationId) return false
  if (options.workspaceId && snapshot.workspaceId !== options.workspaceId) return false
  return true
}

export function listSaasSnapshots(options?: SaasQueryOptions): SaasSnapshot[] {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)

  if (options?.actorUserId) {
    const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID
    assertPermissionInStore(store, {
      operation: 'snapshot:read',
      organizationId,
      workspaceId: options.workspaceId,
      actorUserId: options.actorUserId,
    })
  }

  saveStore(storeFile, store)
  return store.snapshots
    .filter((snapshot) => matchesTenantScope(snapshot, options))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getSaasSummary(options?: SaasQueryOptions): SaasSummary {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)

  if (options?.actorUserId) {
    const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID
    assertPermissionInStore(store, {
      operation: 'summary:read',
      organizationId,
      workspaceId: options.workspaceId,
      actorUserId: options.actorUserId,
    })
  }

  saveStore(storeFile, store)

  const scopedSnapshots = store.snapshots.filter((snapshot) => matchesTenantScope(snapshot, options))
  const scopedWorkspaces = Object.values(store.workspaces).filter((workspace) => {
    if (options?.organizationId && workspace.organizationId !== options.organizationId) return false
    if (options?.workspaceId && workspace.id !== options.workspaceId) return false
    return true
  })
  const scopedRepos = Object.values(store.repos).filter((repo) => {
    if (options?.organizationId && repo.organizationId !== options.organizationId) return false
    if (options?.workspaceId && repo.workspaceId !== options.workspaceId) return false
    return true
  })

  const usersRegistered = options?.organizationId || options?.workspaceId
    ? new Set(scopedSnapshots.map((snapshot) => snapshot.userId)).size
    : Object.keys(store.users).length
  const workspacesActive = scopedWorkspaces.filter(isWorkspaceActive).length
  const reposActive = scopedRepos.filter(isRepoActive).length

  const runsPerMonth: Record<string, number> = {}
  for (const snapshot of scopedSnapshots) {
    const key = monthKey(snapshot.createdAt)
    runsPerMonth[key] = (runsPerMonth[key] ?? 0) + 1
  }

  const thresholdReached = usersRegistered >= store.policy.freeUserThreshold

  return {
    policy: store.policy,
    usersRegistered,
    workspacesActive,
    reposActive,
    runsPerMonth,
    totalSnapshots: scopedSnapshots.length,
    phase: thresholdReached ? 'paid' : 'free',
    thresholdReached,
    freeUsersRemaining: Math.max(0, store.policy.freeUserThreshold - usersRegistered),
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function generateSaasDashboardHtml(options?: { storeFile?: string; policy?: SaasPolicyOverrides }): string {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)
  const summary = getSaasSummary(options)

  const workspaceStats = Object.values(store.workspaces)
    .map((workspace) => {
      const snapshots = store.snapshots.filter((snapshot) => {
        return snapshot.organizationId === workspace.organizationId && snapshot.workspaceId === workspace.id
      })
      const runs = snapshots.length
      const avgScore = runs === 0
        ? 0
        : Math.round(snapshots.reduce((sum, snapshot) => sum + snapshot.totalScore, 0) / runs)
      const lastRun = snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? 'n/a'
      return {
        organizationId: workspace.organizationId,
        id: workspace.id,
        runs,
        avgScore,
        lastRun,
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore)

  const repoStats = Object.values(store.repos)
    .map((repo) => {
      const snapshots = store.snapshots.filter((snapshot) => snapshot.repoId === repo.id)
      const runs = snapshots.length
      const avgScore = runs === 0
        ? 0
        : Math.round(snapshots.reduce((sum, snapshot) => sum + snapshot.totalScore, 0) / runs)
      return {
        workspaceId: repo.workspaceId,
        name: repo.name,
        runs,
        avgScore,
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 15)

  const runsRows = Object.entries(summary.runsPerMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const width = Math.max(8, count * 8)
      return `<tr><td>${escapeHtml(month)}</td><td>${count}</td><td><div class="bar" style="width:${width}px"></div></td></tr>`
    })
    .join('')

  const workspaceRows = workspaceStats
    .map((workspace) => `<tr><td>${escapeHtml(workspace.organizationId)}</td><td>${escapeHtml(workspace.id)}</td><td>${workspace.runs}</td><td>${workspace.avgScore}</td><td>${escapeHtml(workspace.lastRun)}</td></tr>`)
    .join('')

  const repoRows = repoStats
    .map((repo) => `<tr><td>${escapeHtml(repo.workspaceId)}</td><td>${escapeHtml(repo.name)}</td><td>${repo.runs}</td><td>${repo.avgScore}</td></tr>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>drift cloud dashboard</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #f4f7fb; color: #0f172a; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 6px; }
    p.meta { margin: 0 0 20px; color: #475569; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card { background: #ffffff; border-radius: 10px; padding: 14px; border: 1px solid #dbe3ef; }
    .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
    .card .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #ffffff; border: 1px solid #dbe3ef; border-radius: 10px; overflow: hidden; }
    th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; }
    th { background: #eef2f9; }
    .section { margin-top: 18px; }
    .bar { height: 10px; background: linear-gradient(90deg, #0ea5e9, #22c55e); border-radius: 999px; }
    .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
    .pill.free { background: #dcfce7; color: #166534; }
    .pill.paid { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <main>
    <h1>drift cloud dashboard</h1>
    <p class="meta">Store: ${escapeHtml(storeFile)}</p>
    <div class="cards">
      <div class="card"><div class="label">Plan Phase</div><div class="value"><span class="pill ${summary.phase}">${summary.phase.toUpperCase()}</span></div></div>
      <div class="card"><div class="label">Users</div><div class="value">${summary.usersRegistered}</div></div>
      <div class="card"><div class="label">Active Workspaces</div><div class="value">${summary.workspacesActive}</div></div>
      <div class="card"><div class="label">Active Repos</div><div class="value">${summary.reposActive}</div></div>
      <div class="card"><div class="label">Snapshots</div><div class="value">${summary.totalSnapshots}</div></div>
      <div class="card"><div class="label">Free Seats Left</div><div class="value">${summary.freeUsersRemaining}</div></div>
    </div>

    <section class="section">
      <h2>Runs Per Month</h2>
      <table>
        <thead><tr><th>Month</th><th>Runs</th><th>Trend</th></tr></thead>
        <tbody>${runsRows || '<tr><td colspan="3">No runs yet</td></tr>'}</tbody>
      </table>
    </section>

    <section class="section">
        <h2>Workspace Hotspots</h2>
        <table>
        <thead><tr><th>Organization</th><th>Workspace</th><th>Runs</th><th>Avg Score</th><th>Last Run</th></tr></thead>
        <tbody>${workspaceRows || '<tr><td colspan="5">No workspace data</td></tr>'}</tbody>
        </table>
      </section>

    <section class="section">
      <h2>Repo Hotspots</h2>
      <table>
        <thead><tr><th>Workspace</th><th>Repo</th><th>Runs</th><th>Avg Score</th></tr></thead>
        <tbody>${repoRows || '<tr><td colspan="4">No repo data</td></tr>'}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`
}
