import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeProject } from '../src/analyzer.js'
import { buildReport } from '../src/reporter.js'
import { ingestSnapshotFromReport, getSaasSummary, listSaasSnapshots } from '../src/saas.js'

function createProjectDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(dir, 'index.ts'), 'export const value = 1\n')
  return dir
}

function createReport(projectDir: string) {
  const files = analyzeProject(projectDir)
  return buildReport(projectDir, files)
}

describe('saas foundations', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ingest creates snapshot and summary stays consistent', () => {
    const projectDir = createProjectDir('drift-saas-ingest-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')

    const report = createReport(projectDir)
    const snapshot = ingestSnapshotFromReport(report, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      repoName: 'repo-1',
      storeFile,
    })

    const summary = getSaasSummary({ storeFile })

    expect(snapshot.workspaceId).toBe('ws-1')
    expect(summary.usersRegistered).toBe(1)
    expect(summary.workspacesActive).toBe(1)
    expect(summary.reposActive).toBe(1)
    expect(summary.totalSnapshots).toBe(1)
    expect(summary.phase).toBe('free')
  })

  it('blocks ingest when workspace exceeds repo limit', () => {
    const projectDir = createProjectDir('drift-saas-repo-limit-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')
    const report = createReport(projectDir)

    ingestSnapshotFromReport(report, {
      workspaceId: 'ws-2',
      userId: 'user-1',
      repoName: 'repo-a',
      storeFile,
      policy: { maxReposPerWorkspace: 1 },
    })

    expect(() => {
      ingestSnapshotFromReport(report, {
        workspaceId: 'ws-2',
        userId: 'user-1',
        repoName: 'repo-b',
        storeFile,
        policy: { maxReposPerWorkspace: 1 },
      })
    }).toThrow(/max repos/i)

    const summary = getSaasSummary({ storeFile, policy: { maxReposPerWorkspace: 1 } })
    expect(summary.totalSnapshots).toBe(1)
  })

  it('summary reflects free to paid threshold transition', () => {
    const projectDir = createProjectDir('drift-saas-threshold-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')
    const report = createReport(projectDir)

    ingestSnapshotFromReport(report, {
      workspaceId: 'ws-3',
      userId: 'u-1',
      repoName: 'repo-a',
      storeFile,
      policy: { freeUserThreshold: 2 },
    })
    ingestSnapshotFromReport(report, {
      workspaceId: 'ws-4',
      userId: 'u-2',
      repoName: 'repo-b',
      storeFile,
      policy: { freeUserThreshold: 2 },
    })

    const summary = getSaasSummary({ storeFile, policy: { freeUserThreshold: 2 } })
    expect(summary.usersRegistered).toBe(2)
    expect(summary.thresholdReached).toBe(true)
    expect(summary.phase).toBe('paid')
    expect(summary.freeUsersRemaining).toBe(0)
  })

  it('isolates tenant data by organization and workspace filters', () => {
    const projectDir = createProjectDir('drift-saas-tenant-scope-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')
    const report = createReport(projectDir)

    ingestSnapshotFromReport(report, {
      organizationId: 'org-a',
      workspaceId: 'ws-shared',
      userId: 'u-1',
      repoName: 'repo-a',
      storeFile,
    })
    ingestSnapshotFromReport(report, {
      organizationId: 'org-b',
      workspaceId: 'ws-shared',
      userId: 'u-2',
      repoName: 'repo-b',
      storeFile,
    })

    const orgASummary = getSaasSummary({ storeFile, organizationId: 'org-a' })
    const orgBSummary = getSaasSummary({ storeFile, organizationId: 'org-b' })
    const orgASnapshots = listSaasSnapshots({ storeFile, organizationId: 'org-a', workspaceId: 'ws-shared' })

    expect(orgASummary.totalSnapshots).toBe(1)
    expect(orgBSummary.totalSnapshots).toBe(1)
    expect(orgASnapshots).toHaveLength(1)
    expect(orgASnapshots[0]?.organizationId).toBe('org-a')
  })

  it('enforces workspace plan limit and allows plan upgrade', () => {
    const projectDir = createProjectDir('drift-saas-plan-limit-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')
    const report = createReport(projectDir)
    const policy = {
      maxWorkspacesPerOrganizationByPlan: {
        free: 1,
        sponsor: 2,
        team: 4,
        business: 8,
      },
    }

    ingestSnapshotFromReport(report, {
      organizationId: 'org-plan',
      workspaceId: 'ws-1',
      userId: 'owner-1',
      plan: 'free',
      storeFile,
      policy,
    })

    expect(() => {
      ingestSnapshotFromReport(report, {
        organizationId: 'org-plan',
        workspaceId: 'ws-2',
        userId: 'owner-1',
        plan: 'free',
        storeFile,
        policy,
      })
    }).toThrow(/max workspaces/i)

    expect(() => {
      ingestSnapshotFromReport(report, {
        organizationId: 'org-plan',
        workspaceId: 'ws-2',
        userId: 'owner-1',
        plan: 'sponsor',
        storeFile,
        policy,
      })
    }).not.toThrow()
  })

  it('stores role primitives for workspace members', () => {
    const projectDir = createProjectDir('drift-saas-roles-')
    dirs.push(projectDir)
    const storeFile = join(projectDir, '.drift-cloud', 'store.json')
    const report = createReport(projectDir)

    const ownerSnapshot = ingestSnapshotFromReport(report, {
      organizationId: 'org-role',
      workspaceId: 'ws-role',
      userId: 'u-owner',
      storeFile,
    })

    const viewerSnapshot = ingestSnapshotFromReport(report, {
      organizationId: 'org-role',
      workspaceId: 'ws-role',
      userId: 'u-viewer',
      role: 'viewer',
      storeFile,
    })

    expect(ownerSnapshot.role).toBe('owner')
    expect(viewerSnapshot.role).toBe('viewer')
  })
})
