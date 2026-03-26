import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()
const EXPECTED_ENGINE_RANGE = '^20.0.0 || ^22.0.0'
const EXPECTED_NODE_MATRIX = '["20", "22"]'
const EXPECTED_README_RUNTIME = '**Runtime:** Node.js 20.x and 22.x (LTS)'

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('runtime support policy alignment', () => {
  it('keeps package engines aligned with supported Node policy', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { engines?: { node?: string } }
    expect(pkg.engines?.node).toBe(EXPECTED_ENGINE_RANGE)
  })

  it('keeps CI workflows aligned with supported Node policy', () => {
    const reusable = readRepoFile('.github/workflows/reusable-quality-checks.yml')
    const quality = readRepoFile('.github/workflows/quality.yml')
    const initTemplate = readRepoFile('src/init.ts')

    expect(reusable).toContain(`default: '${EXPECTED_NODE_MATRIX}'`)
    expect(quality).toContain(`node_versions: '${EXPECTED_NODE_MATRIX}'`)
    expect(reusable).toContain('run: npm run check:runtime-policy')
    expect(initTemplate).toContain('node-version: 20')
  })

  it('keeps runtime docs and doctor messaging aligned with supported minimum', () => {
    const readme = readRepoFile('README.md')
    const doctor = readRepoFile('src/doctor.ts')

    expect(readme).toContain(EXPECTED_README_RUNTIME)
    expect(doctor).toContain('const MIN_SUPPORTED_NODE_MAJOR = 20')
    expect(doctor).toContain('Node runtime below supported minimum (>=20)')
  })

  it('documents dependency-driven minimum from lockfile constraints', () => {
    const lockfile = readRepoFile('package-lock.json')

    expect(lockfile).toContain('"node_modules/commander"')
    expect(lockfile).toContain('"node": ">=20"')
  })
})
