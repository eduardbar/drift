import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeProject } from '../src/analyzer.js'

describe('plugin contract hardening', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('loads a valid plugin and executes its rule', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-valid-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const foo = 1\n')
    writeFileSync(join(tmpDir, 'valid-plugin.js'), [
      'module.exports = {',
      "  name: 'example-plugin',",
      '  rules: [',
      '    {',
      "      id: 'no-foo-export',",
      "      severity: 'error',",
      '      weight: 12,',
      '      detect(file) {',
      "        if (!file.getFullText().includes('foo')) return []",
      '        return [{',
      "          message: 'Avoid exporting foo',",
      '          line: 1,',
      '          column: 1,',
      "          snippet: 'export const foo = 1',",
      '        }]',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./valid-plugin.js'],
    })

    const allIssues = reports.flatMap((report) => report.issues)
    expect(allIssues.some((issue) => issue.rule === 'example-plugin/no-foo-export')).toBe(true)
    expect(allIssues.some((issue) => issue.rule === 'plugin-error')).toBe(false)
  })

  it('reports actionable diagnostics for invalid plugin contract', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-invalid-contract-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'broken-plugin.js'), [
      'module.exports = {',
      "  name: 'broken-plugin',",
      '  rules: [',
      '    {',
      "      name: 'broken rule id',",
      "      severity: 'fatal',",
      '      weight: 999,',
      "      detect: 'not-a-function',",
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./broken-plugin.js'],
    })

    const pluginIssues = reports
      .flatMap((report) => report.issues)
      .filter((issue) => issue.rule === 'plugin-error')

    expect(pluginIssues.length).toBeGreaterThan(0)
    expect(pluginIssues.some((issue) => issue.message.includes('broken-plugin.js'))).toBe(true)
    expect(pluginIssues.some((issue) => issue.message.includes('broken rule id'))).toBe(true)
  })

  it('surfaces non-fatal plugin validation warnings without failing analysis', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-warning-contract-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'warning-plugin.js'), [
      'module.exports = {',
      "  name: 'warning-plugin',",
      '  rules: [',
      '    {',
      "      id: 'Bad Rule Name',",
      '      detect(a, b, c) {',
      '        return []',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./warning-plugin.js'],
    })

    const issues = reports.flatMap((report) => report.issues)
    expect(issues.some((issue) => issue.rule === 'plugin-warning')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'plugin-error')).toBe(false)
  })

  it('isolates plugin runtime failures and continues analysis', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-runtime-isolation-'))
    writeFileSync(join(tmpDir, 'index.ts'), [
      'export function run(input: any) {',
      '  return input',
      '}',
    ].join('\n'))
    writeFileSync(join(tmpDir, 'mixed-plugin.js'), [
      'module.exports = {',
      "  name: 'mixed-plugin',",
      '  rules: [',
      '    {',
      "      name: 'throwing-rule',",
      '      detect() {',
      "        throw new Error('boom')",
      '      }',
      '    },',
      '    {',
      "      name: 'safe-rule',",
      '      detect() {',
      '        return [{',
      "          message: 'Safe rule still runs',",
      '          line: 1,',
      '          column: 1,',
      "          snippet: 'export function run(input: any)',",
      '        }]',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./mixed-plugin.js'],
    })

    const rules = reports.flatMap((report) => report.issues.map((issue) => issue.rule))
    expect(rules).toContain('mixed-plugin/safe-rule')
    expect(rules).toContain('plugin-error')
    expect(rules).toContain('any-abuse')
  })
})
