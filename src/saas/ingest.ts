import { resolve } from 'node:path'
import type { DriftReportInput, IngestMutationContext, IngestOptions, SaasPlan, SaasRole, SaasSnapshot, SaasStore } from './types.js'
import { createRandomId } from './constants.js'
import { SaasActorRequiredError } from './errors.js'
import { applyRetentionPolicy, assertPermissionInStore, defaultSaasStorePath, loadStoreInternal, saveStore } from './store.js'
import { membershipKey, monthKey, normalizePlan, normalizeRole, resolveScopedIdentity } from './helpers.js'
import { appendPlanChange } from './plan-change.js'

function assertWorkspaceLimit(store: SaasStore, scoped: IngestMutationContext['scoped'], effectivePlan: SaasPlan): void {
  const organization = store.organizations[scoped.organizationId]
  const workspaceLimit = store.policy.maxWorkspacesPerOrganizationByPlan[effectivePlan]
  const workspaceExists = Boolean(store.workspaces[scoped.workspaceKey])
  const workspaceCount = organization?.workspaceIds.length ?? 0

  if (!workspaceExists && workspaceCount >= workspaceLimit) {
    throw new Error(`Organization '${scoped.organizationId}' on plan '${effectivePlan}' reached max workspaces (${workspaceLimit}).`)
  }
}

function assertFreeThresholdLimit(store: SaasStore, userId: string): void {
  const usersRegistered = Object.keys(store.users).length
  const isFreePhase = usersRegistered < store.policy.freeUserThreshold
  if (!isFreePhase) return
  if (!store.users[userId] && usersRegistered + 1 > store.policy.freeUserThreshold) {
    throw new Error(`Free threshold reached (${store.policy.freeUserThreshold} users).`)
  }
}

function assertRepoLimit(store: SaasStore, scoped: IngestMutationContext['scoped']): void {
  const workspace = store.workspaces[scoped.workspaceKey]
  const repoExists = Boolean(store.repos[scoped.repoId])
  const repoCount = workspace?.repoIds.length ?? 0
  if (!repoExists && repoCount >= store.policy.maxReposPerWorkspace) {
    throw new Error(`Workspace '${scoped.workspaceId}' reached max repos (${store.policy.maxReposPerWorkspace}).`)
  }
}

function countWorkspaceRunsThisMonth(store: SaasStore, scoped: IngestMutationContext['scoped'], currentMonth: string): number {
  return store.snapshots.filter((snapshot) => {
    return snapshot.organizationId === scoped.organizationId
      && snapshot.workspaceId === scoped.workspaceId
      && monthKey(snapshot.createdAt) === currentMonth
  }).length
}

function assertGuardrails(store: SaasStore, options: IngestOptions, nowIso: string): void {
  const scoped = resolveScopedIdentity(options)
  const organization = store.organizations[scoped.organizationId]
  const effectivePlan = normalizePlan(options.plan ?? organization?.plan)
  assertWorkspaceLimit(store, scoped, effectivePlan)
  assertFreeThresholdLimit(store, options.userId)
  assertRepoLimit(store, scoped)

  const currentMonth = monthKey(nowIso)
  const runsThisMonth = countWorkspaceRunsThisMonth(store, scoped, currentMonth)
  if (runsThisMonth >= store.policy.maxRunsPerWorkspacePerMonth) {
    throw new Error(`Workspace '${scoped.workspaceId}' reached max monthly runs (${store.policy.maxRunsPerWorkspacePerMonth}).`)
  }
}

function upsertUser(store: SaasStore, userId: string, nowIso: string): void {
  const user = store.users[userId]
  if (user) {
    user.lastSeenAt = nowIso
    return
  }

  store.users[userId] = {
    id: userId,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  }
}

function maybeUpdateOrganizationPlanFromIngest(context: IngestMutationContext): void {
  const { store, scoped, requestedPlan, options, nowIso } = context
  const existingOrg = store.organizations[scoped.organizationId]
  if (!existingOrg || !options.plan || existingOrg.plan === requestedPlan) return

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

function ensureOrganizationForIngest(context: IngestMutationContext): void {
  const { store, scoped, requestedPlan, nowIso } = context
  const existingOrg = store.organizations[scoped.organizationId]
  if (existingOrg) {
    existingOrg.lastSeenAt = nowIso
    maybeUpdateOrganizationPlanFromIngest(context)
    return
  }

  store.organizations[scoped.organizationId] = {
    id: scoped.organizationId,
    plan: requestedPlan,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    workspaceIds: [],
  }
}

function upsertWorkspaceForIngest(
  store: SaasStore,
  scoped: IngestMutationContext['scoped'],
  userId: string,
  nowIso: string,
): { wasCreated: boolean } {
  const workspace = store.workspaces[scoped.workspaceKey]
  if (workspace) {
    workspace.lastSeenAt = nowIso
    if (!workspace.userIds.includes(userId)) workspace.userIds.push(userId)
    return { wasCreated: false }
  }

  store.workspaces[scoped.workspaceKey] = {
    id: scoped.workspaceId,
    organizationId: scoped.organizationId,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    userIds: [userId],
    repoIds: [],
  }

  const org = store.organizations[scoped.organizationId]
  if (!org.workspaceIds.includes(scoped.workspaceId)) org.workspaceIds.push(scoped.workspaceId)
  return { wasCreated: true }
}

function upsertMembershipForIngest(context: IngestMutationContext, workspaceWasCreated: boolean): SaasRole {
  const { store, scoped, options, nowIso } = context
  const membershipId = membershipKey(scoped.organizationId, scoped.workspaceId, options.userId)
  const membership = store.memberships[membershipId]
  let role = normalizeRole(options.role)
  if (!membership && workspaceWasCreated) role = 'owner'

  if (membership) {
    membership.lastSeenAt = nowIso
    if (options.role) membership.role = normalizeRole(options.role)
    return membership.role
  }

  store.memberships[membershipId] = {
    id: membershipId,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    userId: options.userId,
    role,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  }
  return role
}

function upsertRepoForIngest(store: SaasStore, scoped: IngestMutationContext['scoped'], nowIso: string): void {
  const repo = store.repos[scoped.repoId]
  if (repo) {
    repo.lastSeenAt = nowIso
    return
  }

  store.repos[scoped.repoId] = {
    id: scoped.repoId,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    name: scoped.repoName,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  }

  const workspace = store.workspaces[scoped.workspaceKey]
  if (!workspace.repoIds.includes(scoped.repoId)) workspace.repoIds.push(scoped.repoId)
}

function createSnapshotFromReport(report: DriftReportInput, context: IngestMutationContext, role: SaasRole): SaasSnapshot {
  const { store, scoped, options, nowIso, requestedPlan } = context
  return {
    id: createRandomId(String(Date.now())),
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
}

function assertIngestActorRequirement(options: IngestOptions, scoped: IngestMutationContext['scoped'], store: SaasStore): void {
  if (!store.policy.strictActorEnforcement || options.actorUserId) return
  throw new SaasActorRequiredError({
    operation: 'snapshot:write',
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
  })
}

function assertIngestPermissionForActor(store: SaasStore, scoped: IngestMutationContext['scoped'], actorUserId?: string): void {
  if (!actorUserId) return

  const workspaceExists = Boolean(store.workspaces[scoped.workspaceKey])
  const organizationExists = Boolean(store.organizations[scoped.organizationId])
  if (workspaceExists) {
    assertPermissionInStore(store, {
      operation: 'snapshot:write',
      organizationId: scoped.organizationId,
      workspaceId: scoped.workspaceId,
      actorUserId,
    })
    return
  }

  if (organizationExists) {
    assertPermissionInStore(store, {
      operation: 'billing:write',
      organizationId: scoped.organizationId,
      actorUserId,
    })
  }
}

export function ingestSnapshotFromReport(report: DriftReportInput, options: IngestOptions): SaasSnapshot {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const nowIso = new Date().toISOString()
  const scoped = resolveScopedIdentity(options)
  const requestedPlan = normalizePlan(options.plan)
  const context: IngestMutationContext = {
    store,
    scoped,
    options,
    nowIso,
    requestedPlan,
  }

  assertIngestActorRequirement(options, scoped, store)
  assertIngestPermissionForActor(store, scoped, options.actorUserId)
  assertGuardrails(store, options, nowIso)

  upsertUser(store, options.userId, nowIso)
  ensureOrganizationForIngest(context)
  const workspaceState = upsertWorkspaceForIngest(store, scoped, options.userId, nowIso)
  const role = upsertMembershipForIngest(context, workspaceState.wasCreated)
  upsertRepoForIngest(store, scoped, nowIso)

  const snapshot = createSnapshotFromReport(report, context, role)
  store.snapshots.push(snapshot)
  applyRetentionPolicy(store)
  saveStore(storeFile, store)

  return snapshot
}
