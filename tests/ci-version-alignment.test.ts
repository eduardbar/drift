import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function getPackageVersion(): string {
  const pkg = JSON.parse(readRepoFile('package.json')) as { version?: unknown }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json is missing a valid version field')
  }
  return pkg.version
}

function extractVersionDefaultFromAction(content: string): string | undefined {
  const lines = content.split(/\r?\n/)
  const versionLine = lines.findIndex((line) => line.trim() === 'version:')
  if (versionLine === -1) {
    return undefined
  }

  for (let index = versionLine + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (trimmed.endsWith(':') && !trimmed.startsWith('default:')) {
      break
    }
    const match = trimmed.match(/^default:\s*['"](\d+\.\d+\.\d+)['"]$/)
    if (match) {
      return match[1]
    }
  }

  return undefined
}

describe('CI drift version alignment', () => {
  it('keeps action version defaults aligned with package version', () => {
    const packageVersion = getPackageVersion()
    const actionFiles = ['.github/actions/drift-scan/action.yml', '.github/actions/drift-review/action.yml']

    for (const actionFile of actionFiles) {
      const content = readRepoFile(actionFile)
      const actionVersion = extractVersionDefaultFromAction(content)
      expect(actionVersion, `${actionFile} version default must match package.json`).toBe(packageVersion)
    }
  })

  it('keeps documented action versions aligned with package version', () => {
    const packageVersion = getPackageVersion()
    const docs = ['.github/actions/drift-scan/README.md', '.github/actions/drift-review/README.md']
    const versionRegex = /\b(\d+\.\d+\.\d+)\b/g

    for (const doc of docs) {
      const content = readRepoFile(doc)
      const versions = Array.from(content.matchAll(versionRegex), (match) => match[1])

      expect(versions.length, `${doc} should include at least one semver literal`).toBeGreaterThan(0)
      expect(new Set(versions), `${doc} semver literals must match package.json`).toEqual(new Set([packageVersion]))
    }
  })

  it('rejects hardcoded drift package semvers that diverge in CI yaml files', () => {
    const packageVersion = getPackageVersion()
    const yamlFiles = [
      '.github/actions/drift-scan/action.yml',
      '.github/actions/drift-review/action.yml',
      '.github/workflows/quality.yml',
      '.github/workflows/reusable-quality-checks.yml',
      '.github/workflows/review-pr.yml',
      '.github/workflows/publish.yml',
      '.github/workflows/publish-vscode.yml',
    ]

    const mismatches: string[] = []
    const packageRefRegex = /@eduardbar\/drift@(\d+\.\d+\.\d+)/g

    for (const yamlFile of yamlFiles) {
      const content = readRepoFile(yamlFile)
      for (const match of content.matchAll(packageRefRegex)) {
        const version = match[1]
        if (version !== packageVersion) {
          mismatches.push(`${yamlFile}: ${version}`)
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})
