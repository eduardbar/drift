import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeProject } from '../src/analyzer.js'
import { buildReport } from '../src/reporter.js'
import { ingestSnapshotFromReport, getSaasSummary } from '../src/saas.js'

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
})
