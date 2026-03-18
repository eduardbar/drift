import type { SaasPlan, SaasPlanChange, SaasStore } from './types.js'
import { createRandomId } from './constants.js'

export function appendPlanChange(
  store: SaasStore,
  input: { organizationId: string; fromPlan: SaasPlan; toPlan: SaasPlan; changedByUserId: string; reason?: string; changedAt: string },
): SaasPlanChange {
  const change: SaasPlanChange = {
    id: createRandomId(input.changedAt),
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
