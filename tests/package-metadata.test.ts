import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'packages/eslint-plugin-drift/package.json'), 'utf8'),
)

describe('eslint plugin package metadata', () => {
  it('depends on the published drift package version used by this repository', () => {
    expect(packageJson.dependencies['@eduardbar/drift']).toBe('^1.7.0')
  })
})
