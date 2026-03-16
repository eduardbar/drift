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

  it('keeps legacy plugins compatible when apiVersion is missing', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-legacy-compatible-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const foo = 1\n')
    writeFileSync(join(tmpDir, 'legacy-plugin.js'), [
      'module.exports = {',
      "  name: 'legacy-plugin',",
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
      '    },',
      '    {',
      "      id: 'Legacy Rule Name',",
      '      detect() { return [] }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./legacy-plugin.js'],
    })

    const allIssues = reports.flatMap((report) => report.issues)
    expect(allIssues.some((issue) => issue.rule === 'legacy-plugin/no-foo-export')).toBe(true)
    expect(allIssues.some((issue) => issue.rule === 'plugin-error')).toBe(false)
    expect(allIssues.some((issue) => issue.rule === 'plugin-warning' && issue.message.includes('[plugin-api-version-implicit]'))).toBe(true)
    expect(allIssues.some((issue) => issue.rule === 'plugin-warning' && issue.message.includes('[plugin-rule-id-format-legacy]'))).toBe(true)
  })

  it('reports actionable diagnostics for invalid plugin contract', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-invalid-contract-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'broken-plugin.js'), [
      'module.exports = {',
      "  name: 'broken-plugin',",
      "  apiVersion: 1,",
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
    expect(pluginIssues.some((issue) => issue.message.includes('[plugin-rule-detect-invalid]'))).toBe(true)
  })

  it('rejects plugins with unsupported apiVersion', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-version-mismatch-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'version-mismatch-plugin.js'), [
      'module.exports = {',
      "  name: 'version-mismatch-plugin',",
      '  apiVersion: 99,',
      '  rules: [',
      '    {',
      "      id: 'valid-rule-id',",
      '      detect() { return [] }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./version-mismatch-plugin.js'],
    })

    const issues = reports.flatMap((report) => report.issues)
    expect(issues.some((issue) => issue.rule === 'plugin-error' && issue.message.includes('[plugin-api-version-unsupported]'))).toBe(true)
    expect(issues.some((issue) => issue.rule === 'version-mismatch-plugin/valid-rule-id')).toBe(false)
  })

  it('rejects plugins with invalid apiVersion format', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-version-invalid-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'version-invalid-plugin.js'), [
      'module.exports = {',
      "  name: 'version-invalid-plugin',",
      "  apiVersion: '1',",
      '  rules: [',
      '    {',
      "      id: 'valid-rule-id',",
      '      detect() { return [] }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./version-invalid-plugin.js'],
    })

    const issues = reports.flatMap((report) => report.issues)
    expect(issues.some((issue) => issue.rule === 'plugin-error' && issue.message.includes('[plugin-api-version-invalid]'))).toBe(true)
    expect(issues.some((issue) => issue.rule === 'version-invalid-plugin/valid-rule-id')).toBe(false)
  })

  it('rejects duplicate rule IDs within the same plugin', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-duplicate-rules-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const ok = true\n')
    writeFileSync(join(tmpDir, 'duplicate-rules-plugin.js'), [
      'module.exports = {',
      "  name: 'duplicate-rules-plugin',",
      '  apiVersion: 1,',
      '  rules: [',
      '    {',
      "      id: 'duplicate-rule',",
      '      detect() {',
      '        return [{',
      "          message: 'first duplicate still runs',",
      '          line: 1,',
      '          column: 1,',
      "          snippet: 'export const ok = true',",
      '        }]',
      '      }',
      '    },',
      '    {',
      "      id: 'duplicate-rule',",
      '      detect() { return [] }',
      '    }',
      '  ]',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      plugins: ['./duplicate-rules-plugin.js'],
    })

    const issues = reports.flatMap((report) => report.issues)
    expect(issues.some((issue) => issue.rule === 'plugin-error' && issue.message.includes('[plugin-rule-id-duplicate]'))).toBe(true)
    expect(issues.some((issue) => issue.rule === 'duplicate-rules-plugin/duplicate-rule')).toBe(true)
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
      '  apiVersion: 1,',
      '  capabilities: {',
      '    fixes: true,',
      '    runtimeSafe: true',
      '  },',
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
    expect(rules).not.toContain('plugin-warning')
  })
})
