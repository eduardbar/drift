import type { SaasOperation, SaasPlan, SaasPolicy, SaasRole } from './types.js'

export const STORE_VERSION = 3
export const ACTIVE_WINDOW_DAYS = 30
export const DEFAULT_ORGANIZATION_ID = 'default-org'
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
const RANDOM_ID_RADIX = 16
const RANDOM_ID_START = 2
const RANDOM_ID_END = 10

export const DASHBOARD_REPO_LIMIT = 15
export const DASHBOARD_BAR_UNIT = 8
export const DASHBOARD_BAR_MIN_WIDTH = 8

export const VALID_ROLES: SaasRole[] = ['owner', 'member', 'viewer']
export const VALID_PLANS: SaasPlan[] = ['free', 'sponsor', 'team', 'business']

export const ROLE_PRIORITY: Record<SaasRole, number> = {
  viewer: 1,
  member: 2,
  owner: 3,
}

export const REQUIRED_ROLE_BY_OPERATION: Record<SaasOperation, SaasRole> = {
  'snapshot:write': 'member',
  'snapshot:read': 'viewer',
  'summary:read': 'viewer',
  'billing:write': 'owner',
  'billing:read': 'viewer',
}

export const DEFAULT_SAAS_POLICY: SaasPolicy = {
  freeUserThreshold: 7500,
  maxRunsPerWorkspacePerMonth: 500,
  maxReposPerWorkspace: 20,
  retentionDays: 90,
  strictActorEnforcement: false,
  maxWorkspacesPerOrganizationByPlan: {
    free: 20,
    sponsor: 50,
    team: 200,
    business: 1000,
  },
}

export function daysAgo(days: number): number {
  const now = Date.now()
  return now - days * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
}

export function createRandomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(RANDOM_ID_RADIX).slice(RANDOM_ID_START, RANDOM_ID_END)}`
}
