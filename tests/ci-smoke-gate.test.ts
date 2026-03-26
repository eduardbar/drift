import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('CI smoke E2E gate', () => {
  it('runs smoke:repo in reusable quality checks', () => {
    const workflow = readRepoFile('.github/workflows/reusable-quality-checks.yml')

    expect(workflow).toContain('name: Run CLI smoke E2E')
    expect(workflow).toContain('run: npm run smoke:repo -- --base HEAD --out .drift-smoke/ci-node-${{ matrix.node }}')
  })

  it('uploads smoke artifacts even when smoke fails', () => {
    const workflow = readRepoFile('.github/workflows/reusable-quality-checks.yml')

    expect(workflow).toContain('name: Upload smoke E2E artifacts')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('path: .drift-smoke/ci-node-${{ matrix.node }}/')
  })
})
