import { resolve } from 'node:path'
import type {
  ChangeOrganizationPlanOptions,
  SaasOrganizationUsageSnapshot,
  SaasPlanChange,
  SaasPlanChangeQueryOptions,
  SaasUsageQueryOptions,
} from './types.js'
import { assertPermissionInStore, defaultSaasStorePath, loadStoreInternal, saveStore } from './store.js'
import { monthKey, normalizePlan, workspaceKey } from './helpers.js'
import { appendPlanChange } from './plan-change.js'

export function changeOrganizationPlan(options: ChangeOrganizationPlanOptions): SaasPlanChange {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const nowIso = new Date().toISOString()

  const organization = store.organizations[options.organizationId]
  if (!organization) throw new Error(`Organization '${options.organizationId}' does not exist.`)

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
  if (!organization) throw new Error(`Organization '${options.organizationId}' does not exist.`)

  const month = options.month ?? monthKey(new Date().toISOString())
  const organizationRunSnapshots = store.snapshots.filter((snapshot) => snapshot.organizationId === options.organizationId)

  return {
    organizationId: options.organizationId,
    plan: organization.plan,
    capturedAt: new Date().toISOString(),
    workspaceCount: organization.workspaceIds.length,
    repoCount: organization.workspaceIds
      .map((workspaceId) => store.workspaces[workspaceKey(options.organizationId, workspaceId)])
      .filter((workspace) => Boolean(workspace))
      .reduce((count, workspace) => count + workspace.repoIds.length, 0),
    runCount: organizationRunSnapshots.length,
    runCountThisMonth: organizationRunSnapshots.filter((snapshot) => monthKey(snapshot.createdAt) === month).length,
  }
}
