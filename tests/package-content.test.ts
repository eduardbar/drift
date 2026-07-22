import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const shipsSourceMaps = true
// The build wrapper cleans dist first, so this is the compiler's actual clean output,
// not a hand-maintained source-extension manifest. Declaration and source maps ship.
const sourceSchemaNames = [
  'drift-ai-output.v1.json',
  'drift-doctor.v1.json',
  'drift-guard.v1.json',
  'drift-report.v1.json',
  'drift-trust.v1.json',
]

function filesUnder(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(entryPath, root)
    return [relative(root, entryPath)]
  })
}

function compilerArtifacts(): string[] {
  const distRoot = join(repoRoot, 'dist')
  const files = filesUnder(distRoot).map((file) => `dist/${file.replaceAll('\\', '/')}`)
  const allowedSuffixes = shipsSourceMaps
    ? ['.js', '.d.ts', '.js.map', '.d.ts.map']
    : ['.js', '.d.ts']
  expect(files.every((file) => allowedSuffixes.some((suffix) => file.endsWith(suffix)))).toBe(true)
  return files.sort()
}

function packedFiles(): string[] {
  execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' })
  const output = execSync('npm pack --dry-run --ignore-scripts --json', {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const result = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>
  return result[0]?.files.map(({ path }) => path.replace(/^package\//, '')) ?? []
}

describe('npm package contents', () => {
  it('builds from clean output and publishes only legitimate runtime artifacts', () => {
    const files = packedFiles()
    const expectedDist = compilerArtifacts()
    const actualDist = files.filter((file) => file.startsWith('dist/')).sort()
    const sourceSchemas = readdirSync(join(repoRoot, 'schemas')).filter((file) => file.endsWith('.json')).sort()
    const packagedSchemas = files
      .filter((file) => file.startsWith('schemas/'))
      .map((file) => file.slice('schemas/'.length))
      .sort()
    const forbiddenRoots = [
      '.atl/',
      '.github/',
      'assets/',
      'docs/',
      'openspec/',
      'out/',
      'packages/',
      'remotion/',
      'site/',
      'src/',
      'tests/',
    ]

    expect(files).toContain('bin/drift.js')
    expect(files).toContain('benchmarks/perf-budget.v1.json')
    expect(files).toContain('README.md')
    expect(files).toContain('LICENSE')
    expect(files).toContain('dist/cli.js')
    expect(files).toContain('dist/index.js')
    expect(files).toContain('dist/mcp-server.js')
    expect(files).toContain('dist/ai-guard-guardian.js')
    expect(files).toContain('dist/cleanup-guardian.js')
    expect(files).not.toContain('package-lock.json')
    expect(sourceSchemas).toEqual(sourceSchemaNames)
    expect(packagedSchemas).toEqual(sourceSchemaNames)
    expect(actualDist).toEqual(expectedDist)

    for (const file of files) {
      expect(forbiddenRoots.some((root) => file.startsWith(root))).toBe(false)
      expect(
        file === 'package.json'
        || file === 'README.md'
        || file === 'LICENSE'
        || file === 'bin/drift.js'
        || file === 'benchmarks/perf-budget.v1.json'
        || expectedDist.includes(file)
        || sourceSchemaNames.includes(file.slice('schemas/'.length)),
      ).toBe(true)
    }
  })
})
