import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('CI quality matrix contract', () => {
  it('requires Node 20/22 in reusable and entry workflows', () => {
    const reusable = readRepoFile('.github/workflows/reusable-quality-checks.yml')
    const quality = readRepoFile('.github/workflows/quality.yml')

    expect(reusable).toContain("default: '[\"20\", \"22\"]'")
    expect(quality).toContain("node_versions: '[\"20\", \"22\"]'")
    expect(quality).toContain('pull_request:')
    expect(quality).toContain('branches: [main, master]')
    expect(quality).toContain('uses: ./.github/workflows/reusable-quality-checks.yml')
  })

  it('includes required quality commands in reusable checks', () => {
    const reusable = readRepoFile('.github/workflows/reusable-quality-checks.yml')

    expect(reusable).toContain('run: npm ci')
    expect(reusable).toContain('run: npm run check:runtime-policy')
    expect(reusable).toContain('run: npm run check:docs-drift')
    expect(reusable).toContain("if: matrix.node == '20'")
    expect(reusable).toContain('run: npm run check:perf-budget -- --out .drift-perf/ci-node-${{ matrix.node }}/benchmark-latest.json')
    expect(reusable).toContain('run: npm test')
    expect(reusable).toContain('run: npm run test:coverage')
    expect(reusable).toContain('run: npm run build')
    expect(reusable).toContain('name: Upload perf gate artifacts')
    expect(reusable).toContain('path: .drift-perf/ci-node-${{ matrix.node }}/')
  })
})
