import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { DriftReport, DriftConfig } from './types.js'

export interface SaasPolicy {
  freeUserThreshold: number
  maxRunsPerWorkspacePerMonth: number
  maxReposPerWorkspace: number
  retentionDays: number
}

export interface SaasUser {
  id: string
  createdAt: string
  lastSeenAt: string
}

export interface SaasWorkspace {
  id: string
  createdAt: string
  lastSeenAt: string
  userIds: string[]
  repoIds: string[]
}

export interface SaasRepo {
  id: string
  workspaceId: string
  name: string
  createdAt: string
  lastSeenAt: string
}

export interface SaasSnapshot {
  id: string
  createdAt: string
  scannedAt: string
  workspaceId: string
  userId: string
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
  workspaces: Record<string, SaasWorkspace>
  repos: Record<string, SaasRepo>
  snapshots: SaasSnapshot[]
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

export interface IngestOptions {
  workspaceId: string
  userId: string
  repoName?: string
  storeFile?: string
  policy?: Partial<SaasPolicy>
}

const STORE_VERSION = 1
const ACTIVE_WINDOW_DAYS = 30

export const DEFAULT_SAAS_POLICY: SaasPolicy = {
  freeUserThreshold: 7500,
  maxRunsPerWorkspacePerMonth: 500,
  maxReposPerWorkspace: 20,
  retentionDays: 90,
}

export function resolveSaasPolicy(policy?: Partial<SaasPolicy> | DriftConfig['saas']): SaasPolicy {
  return {
    ...DEFAULT_SAAS_POLICY,
    ...(policy ?? {}),
  }
}

export function defaultSaasStorePath(root = '.'): string {
  return resolve(root, '.drift-cloud', 'store.json')
}

function ensureStoreFile(storeFile: string, policy?: Partial<SaasPolicy>): void {
  const dir = dirname(storeFile)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(storeFile)) {
    const initial = createEmptyStore(policy)
    writeFileSync(storeFile, JSON.stringify(initial, null, 2), 'utf8')
  }
}

function createEmptyStore(policy?: Partial<SaasPolicy>): SaasStore {
  return {
    version: STORE_VERSION,
    policy: resolveSaasPolicy(policy),
    users: {},
    workspaces: {},
    repos: {},
    snapshots: [],
  }
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

function loadStoreInternal(storeFile: string, policy?: Partial<SaasPolicy>): SaasStore {
  ensureStoreFile(storeFile, policy)
  const raw = readFileSync(storeFile, 'utf8')
  const parsed = JSON.parse(raw) as Partial<SaasStore>

  const merged = createEmptyStore(parsed.policy)
  merged.version = parsed.version ?? STORE_VERSION
  merged.users = parsed.users ?? {}
  merged.workspaces = parsed.workspaces ?? {}
  merged.repos = parsed.repos ?? {}
  merged.snapshots = parsed.snapshots ?? []
  merged.policy = resolveSaasPolicy({ ...merged.policy, ...policy })
  applyRetention(merged)

  return merged
}

function isWorkspaceActive(workspace: SaasWorkspace): boolean {
  return new Date(workspace.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

function isRepoActive(repo: SaasRepo): boolean {
  return new Date(repo.lastSeenAt).getTime() >= daysAgo(ACTIVE_WINDOW_DAYS)
}

function assertGuardrails(store: SaasStore, options: IngestOptions, nowIso: string): void {
  const usersRegistered = Object.keys(store.users).length
  const isFreePhase = usersRegistered < store.policy.freeUserThreshold
  if (!isFreePhase) return

  if (!store.users[options.userId] && usersRegistered + 1 > store.policy.freeUserThreshold) {
    throw new Error(`Free threshold reached (${store.policy.freeUserThreshold} users).`) 
  }

  const workspace = store.workspaces[options.workspaceId]
  const repoName = options.repoName ?? 'default'
  const repoId = `${options.workspaceId}:${repoName}`
  const repoExists = Boolean(store.repos[repoId])
  const repoCount = workspace?.repoIds.length ?? 0

  if (!repoExists && repoCount >= store.policy.maxReposPerWorkspace) {
    throw new Error(`Workspace '${options.workspaceId}' reached max repos (${store.policy.maxReposPerWorkspace}).`)
  }

  const currentMonth = monthKey(nowIso)
  const runsThisMonth = store.snapshots.filter((snapshot) => {
    return snapshot.workspaceId === options.workspaceId && monthKey(snapshot.createdAt) === currentMonth
  }).length

  if (runsThisMonth >= store.policy.maxRunsPerWorkspacePerMonth) {
    throw new Error(`Workspace '${options.workspaceId}' reached max monthly runs (${store.policy.maxRunsPerWorkspacePerMonth}).`)
  }
}

export function ingestSnapshotFromReport(report: DriftReport, options: IngestOptions): SaasSnapshot {
  const storeFile = resolve(options.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options.policy)
  const nowIso = new Date().toISOString()

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

  const workspace = store.workspaces[options.workspaceId]
  if (workspace) {
    workspace.lastSeenAt = nowIso
    if (!workspace.userIds.includes(options.userId)) workspace.userIds.push(options.userId)
  } else {
    store.workspaces[options.workspaceId] = {
      id: options.workspaceId,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      userIds: [options.userId],
      repoIds: [],
    }
  }

  const repoName = options.repoName ?? 'default'
  const repoId = `${options.workspaceId}:${repoName}`
  const repo = store.repos[repoId]
  if (repo) {
    repo.lastSeenAt = nowIso
  } else {
    store.repos[repoId] = {
      id: repoId,
      workspaceId: options.workspaceId,
      name: repoName,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    }
    const ws = store.workspaces[options.workspaceId]
    if (!ws.repoIds.includes(repoId)) ws.repoIds.push(repoId)
  }

  const snapshot: SaasSnapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: nowIso,
    scannedAt: report.scannedAt,
    workspaceId: options.workspaceId,
    userId: options.userId,
    repoId,
    repoName,
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

export function getSaasSummary(options?: { storeFile?: string; policy?: Partial<SaasPolicy> }): SaasSummary {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)
  saveStore(storeFile, store)

  const usersRegistered = Object.keys(store.users).length
  const workspacesActive = Object.values(store.workspaces).filter(isWorkspaceActive).length
  const reposActive = Object.values(store.repos).filter(isRepoActive).length

  const runsPerMonth: Record<string, number> = {}
  for (const snapshot of store.snapshots) {
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
    totalSnapshots: store.snapshots.length,
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

export function generateSaasDashboardHtml(options?: { storeFile?: string; policy?: Partial<SaasPolicy> }): string {
  const storeFile = resolve(options?.storeFile ?? defaultSaasStorePath())
  const store = loadStoreInternal(storeFile, options?.policy)
  const summary = getSaasSummary(options)

  const workspaceStats = Object.values(store.workspaces)
    .map((workspace) => {
      const snapshots = store.snapshots.filter((snapshot) => snapshot.workspaceId === workspace.id)
      const runs = snapshots.length
      const avgScore = runs === 0
        ? 0
        : Math.round(snapshots.reduce((sum, snapshot) => sum + snapshot.totalScore, 0) / runs)
      const lastRun = snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? 'n/a'
      return {
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
    .map((workspace) => `<tr><td>${escapeHtml(workspace.id)}</td><td>${workspace.runs}</td><td>${workspace.avgScore}</td><td>${escapeHtml(workspace.lastRun)}</td></tr>`)
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
        <thead><tr><th>Workspace</th><th>Runs</th><th>Avg Score</th><th>Last Run</th></tr></thead>
        <tbody>${workspaceRows || '<tr><td colspan="4">No workspace data</td></tr>'}</tbody>
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
