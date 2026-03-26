import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const checkScriptPath = join(repoRoot, 'scripts/check-docs-drift.mjs')
const tempDirs: string[] = []

function runCheck(cwd: string) {
  return spawnSync(process.execPath, [checkScriptPath], {
    cwd,
    encoding: 'utf8',
  })
}

function writeFixtureFile(root: string, relativePath: string, content: string) {
  const filePath = join(root, relativePath)
  const directory = dirname(filePath)
  mkdirSync(directory, { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function createFixture(options?: { agentsVersion?: string; catalogMissingRule?: boolean; readmeCount?: number }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'drift-docs-check-'))
  tempDirs.push(fixtureRoot)

  const agentsVersion = options?.agentsVersion ?? '1.4.0'
  const catalogMissingRule = options?.catalogMissingRule ?? false
  const readmeCount = options?.readmeCount ?? 2

  writeFixtureFile(fixtureRoot, 'package.json', JSON.stringify({ version: '1.4.0' }, null, 2))
  writeFixtureFile(
    fixtureRoot,
    'src/analyzer.ts',
    `export const RULE_WEIGHTS = {\n  'large-file': { severity: 'error', weight: 20 },\n  'dead-code': { severity: 'warning', weight: 8 },\n}\n`,
  )

  const catalogTableRows = catalogMissingRule
    ? "| `large-file` | error | 20 | phase0-basic | sample |"
    : [
      '| `large-file` | error | 20 | phase0-basic | sample |',
      '| `dead-code` | warning | 8 | phase0-basic | sample |',
    ].join('\n')

  const catalogTotal = catalogMissingRule ? 1 : 2
  writeFixtureFile(
    fixtureRoot,
    'docs/rules-catalog.md',
    [
      '# drift rules catalog (current)',
      '',
      'Source of truth: `RULE_WEIGHTS` in `src/analyzer.ts`.',
      '',
      '| id | severity | weight | phase/origin | note |',
      '|---|---|---:|---|---|',
      catalogTableRows,
      '',
      `- Total rule IDs currently defined: **${catalogTotal}**.`,
      '',
    ].join('\n'),
  )

  writeFixtureFile(fixtureRoot, 'README.md', `drift currently defines **${readmeCount} rule IDs** in RULE_WEIGHTS.`)
  writeFixtureFile(
    fixtureRoot,
    'AGENTS.md',
    [
      '# AGENTS.md — drift',
      `- Versión del paquete: \`${agentsVersion}\` (\`package.json\`)`,
      '- Estado actual: **2 rule IDs** (sample).',
      '',
    ].join('\n'),
  )

  return fixtureRoot
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('docs drift checker', () => {
  it('passes against the real repository contract', () => {
    const result = runCheck(repoRoot)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Docs drift check passed')
    expect(result.stderr).toBe('')
  })

  it('fails when AGENTS package version diverges from package.json', () => {
    const fixtureRoot = createFixture({ agentsVersion: '9.9.9' })

    const result = runCheck(fixtureRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Docs drift check failed:')
    expect(result.stderr).toContain('AGENTS.md package version (9.9.9) does not match package.json (1.4.0)')
  })

  it('fails when catalog rule IDs diverge from RULE_WEIGHTS', () => {
    const fixtureRoot = createFixture({ catalogMissingRule: true, readmeCount: 1 })

    const result = runCheck(fixtureRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('rules missing in docs/rules-catalog.md: dead-code')
    expect(result.stderr).toContain('README.md rule ID count (1) does not match RULE_WEIGHTS (2)')
  })
})
