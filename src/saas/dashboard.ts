import { resolve } from 'node:path'
import type { SaasPolicyOverrides, SaasQueryOptions, SaasSnapshot, SaasSummary } from './types.js'
import { DASHBOARD_BAR_MIN_WIDTH, DASHBOARD_BAR_UNIT, DASHBOARD_REPO_LIMIT } from './constants.js'
import { assertPermissionInStore, defaultSaasStorePath, loadStoreInternal, saveStore } from './store.js'
import {
  DEFAULT_ORGANIZATION_ID,
  computeRunsPerMonth,
  computeUsersRegistered,
  escapeHtml,
  isRepoActive,
  isWorkspaceActive,
  matchesRepoScope,
  matchesTenantScope,
  matchesWorkspaceScope,
} from './helpers.js'

function assertSummaryReadPermission(store: ReturnType<typeof loadStoreInternal>, options?: SaasQueryOptions): void {
  const shouldEnforceActorForScope = store.policy.strictActorEnforcement && Boolean(options?.organizationId || options?.workspaceId)
  if (!options?.actorUserId && !shouldEnforceActorForScope) return

  const organizationId = options?.organizationId ?? DEFAULT_ORGANIZATION_ID
  assertPermissionInStore(store, {
    operation: 'summary:read',
    organizationId,
    workspaceId: options?.workspaceId,
    actorUserId: options?.actorUserId,
  })
}

function buildWorkspaceStats(store: ReturnType<typeof loadStoreInternal>): Array<{
  organizationId: string
  id: string
  runs: number
  avgScore: number
  lastRun: string
}> {
  return Object.values(store.workspaces)
    .map((workspace) => {
      const snapshots = store.snapshots.filter((snapshot) => snapshot.organizationId === workspace.organizationId && snapshot.workspaceId === workspace.id)
      const runs = snapshots.length
      const avgScore = runs === 0 ? 0 : Math.round(snapshots.reduce((sum, snapshot) => sum + snapshot.totalScore, 0) / runs)
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
}

function buildRepoStats(store: ReturnType<typeof loadStoreInternal>): Array<{ workspaceId: string; name: string; runs: number; avgScore: number }> {
  return Object.values(store.repos)
    .map((repo) => {
      const snapshots = store.snapshots.filter((snapshot) => snapshot.repoId === repo.id)
      const runs = snapshots.length
      const avgScore = runs === 0 ? 0 : Math.round(snapshots.reduce((sum, snapshot) => sum + snapshot.totalScore, 0) / runs)
      return {
        workspaceId: repo.workspaceId,
        name: repo.name,
        runs,
        avgScore,
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, DASHBOARD_REPO_LIMIT)
}

function buildRunsRows(summary: SaasSummary): string {
  return Object.entries(summary.runsPerMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const width = Math.max(DASHBOARD_BAR_MIN_WIDTH, count * DASHBOARD_BAR_UNIT)
      return `<tr><td>${escapeHtml(month)}</td><td>${count}</td><td><div class="bar" style="width:${width}px"></div></td></tr>`
    })
    .join('')
}

function buildWorkspaceRows(workspaceStats: Array<{ organizationId: string; id: string; runs: number; avgScore: number; lastRun: string }>): string {
  return workspaceStats
    .map((workspace) => `<tr><td>${escapeHtml(workspace.organizationId)}</td><td>${escapeHtml(workspace.id)}</td><td>${workspace.runs}</td><td>${workspace.avgScore}</td><td>${escapeHtml(workspace.lastRun)}</td></tr>`)
    .join('')
}

function buildRepoRows(repoStats: Array<{ workspaceId: string; name: string; runs: number; avgScore: number }>): string {
  return repoStats
    .map((repo) => `<tr><td>${escapeHtml(repo.workspaceId)}</td><td>${escapeHtml(repo.name)}</td><td>${repo.runs}</td><td>${repo.avgScore}</td></tr>`)
    .join('')
}

function renderDashboardHtmlDocument(input: {
  storeFile: string
  summary: SaasSummary
  runsRows: string
  workspaceRows: string
  repoRows: string
}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>drift cloud dashboard</title><style>:root { color-scheme: light; } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #f4f7fb; color: #0f172a; } main { max-width: 980px; margin: 0 auto; padding: 24px; } h1 { margin: 0 0 6px; } p.meta { margin: 0 0 20px; color: #475569; } .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; } .card { background: #ffffff; border-radius: 10px; padding: 14px; border: 1px solid #dbe3ef; } .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; } .card .value { font-size: 26px; font-weight: 700; margin-top: 4px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #ffffff; border: 1px solid #dbe3ef; border-radius: 10px; overflow: hidden; } th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; } th { background: #eef2f9; } .section { margin-top: 18px; } .bar { height: 10px; background: linear-gradient(90deg, #0ea5e9, #22c55e); border-radius: 999px; } .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; } .pill.free { background: #dcfce7; color: #166534; } .pill.paid { background: #fee2e2; color: #991b1b; }</style></head><body><main><h1>drift cloud dashboard</h1><p class="meta">Store: ${escapeHtml(input.storeFile)}</p><div class="cards"><div class="card"><div class="label">Plan Phase</div><div class="value"><span class="pill ${input.summary.phase}">${input.summary.phase.toUpperCase()}</span></div></div><div class="card"><div class="label">Users</div><div class="value">${input.summary.usersRegistered}</div></div><div class="card"><div class="label">Active Workspaces</div><div class="value">${input.summary.workspacesActive}</div></div><div class="card"><div class="label">Active Repos</div><div class="value">${input.summary.reposActive}</div></div><div class="card"><div class="label">Snapshots</div><div class="value">${input.summary.totalSnapshots}</div></div><div class="card"><div class="label">Free Seats Left</div><div class="value">${input.summary.freeUsersRemaining}</div></div></div><section class="section"><h2>Runs Per Month</h2><table><thead><tr><th>Month</th><th>Runs</th><th>Trend</th></tr></thead><tbody>${input.runsRows || '<tr><td colspan="3">No runs yet</td></tr>'}</tbody></table></section><section class="section"><h2>Workspace Hotspots</h2><table><thead><tr><th>Organization</th><th>Workspace</th><th>Runs</th><th>Avg Score</th><th>Last Run</th></tr></thead><tbody>${input.workspaceRows || '<tr><td colspan="5">No workspace data</td></tr>'}</tbody></table></section><section class="section"><h2>Repo Hotspots</h2><table><thead><tr><th>Workspace</th><th>Repo</th><th>Runs</th><th>Avg Score</th></tr></thead><tbody>${input.repoRows || '<tr><td colspan="4">No repo data</td></tr>'}</tbody></table></section></main></body></html>`
}

export function listSaasSnapshots(options?: SaasQueryOptions): SaasSnapshot[] {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)

  const shouldEnforceActorForScope = store.policy.strictActorEnforcement && Boolean(options?.organizationId || options?.workspaceId)
  if (options?.actorUserId || shouldEnforceActorForScope) {
    const organizationId = options?.organizationId ?? DEFAULT_ORGANIZATION_ID
    assertPermissionInStore(store, {
      operation: 'snapshot:read',
      organizationId,
      workspaceId: options?.workspaceId,
      actorUserId: options?.actorUserId,
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

  assertSummaryReadPermission(store, options)
  saveStore(storeFile, store)

  const scopedSnapshots = store.snapshots.filter((snapshot) => matchesTenantScope(snapshot, options))
  const scopedWorkspaces = Object.values(store.workspaces).filter((workspace) => matchesWorkspaceScope(workspace, options))
  const scopedRepos = Object.values(store.repos).filter((repo) => matchesRepoScope(repo, options))

  const usersRegistered = computeUsersRegistered(store, scopedSnapshots, options)
  const workspacesActive = scopedWorkspaces.filter((workspace) => isWorkspaceActive(workspace)).length
  const reposActive = scopedRepos.filter((repo) => isRepoActive(repo)).length
  const runsPerMonth = computeRunsPerMonth(scopedSnapshots)
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

export function generateSaasDashboardHtml(options?: { storeFile?: string; policy?: SaasPolicyOverrides }): string {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)
  const summary = getSaasSummary(options)

  const workspaceStats = buildWorkspaceStats(store)
  const repoStats = buildRepoStats(store)
  const runsRows = buildRunsRows(summary)
  const workspaceRows = buildWorkspaceRows(workspaceStats)
  const repoRows = buildRepoRows(repoStats)

  return renderDashboardHtmlDocument({
    storeFile,
    summary,
    runsRows,
    workspaceRows,
    repoRows,
  })
}
