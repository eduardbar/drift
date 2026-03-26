import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeProject } from '../src/analyzer.js'
import { buildReport, formatAIOutput } from '../src/reporter.js'
import { formatReviewMarkdown } from '../src/review.js'
import { generateArchitectureSvg } from '../src/map.js'
import { applyFixes } from '../src/fix.js'

type DriftReview = Parameters<typeof formatReviewMarkdown>[0]

describe('new feature MVP', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('includes ai_likelihood and suspected files in --ai output', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-ai-output-'))
    writeFileSync(join(tmpDir, 'bad.ts'), [
      'function x(a: any) {',
      '  // return value',
      '  if (a) return 1',
      '  return 0',
      '}',
      'const URL = "https://api.example.com"',
    ].join('\n'))

    const files = analyzeProject(tmpDir)
    const report = buildReport(tmpDir, files)
    const ai = formatAIOutput(report)

    expect(ai.summary.ai_likelihood).toBeGreaterThanOrEqual(0)
    expect(typeof ai.summary.ai_code_smell_score).toBe('number')
    expect(Array.isArray(ai.files_suspected)).toBe(true)
    expect(ai.maintenance_risk).toBeDefined()
    expect(ai.quality).toBeDefined()
    expect(ai.$schema).toBe('schemas/drift-ai-output.v1.json')
    expect(typeof ai.toolVersion).toBe('string')
    expect(ai.toolVersion.length).toBeGreaterThan(0)
    expect(report.$schema).toBe('schemas/drift-report.v1.json')
    expect(typeof report.toolVersion).toBe('string')
    expect(report.toolVersion.length).toBeGreaterThan(0)
  })

  it('formats review markdown for PR comments', () => {
    const review: DriftReview = {
      baseRef: 'origin/main',
      scannedAt: new Date().toISOString(),
      totalDelta: 12,
      newIssues: 3,
      resolvedIssues: 1,
      status: 'regressed',
      summary: 'Drift regressed.',
      markdown: '',
      diff: {
        baseRef: 'origin/main',
        projectPath: '/tmp/repo',
        scannedAt: new Date().toISOString(),
        files: [{
          path: 'src/a.ts',
          scoreBefore: 10,
          scoreAfter: 20,
          scoreDelta: 10,
          newIssues: [],
          resolvedIssues: [],
        }],
        totalScoreBefore: 20,
        totalScoreAfter: 32,
        totalDelta: 12,
        newIssuesCount: 3,
        resolvedIssuesCount: 1,
      },
    }

    const md = formatReviewMarkdown(review)
    expect(md).toContain('## drift review')
    expect(md).toContain('Base ref: `origin/main`')
    expect(md).toContain('src/a.ts')
  })

  it('detects configurable architecture rules', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-arch-rules-'))
    mkdirSync(join(tmpDir, 'controllers'))
    mkdirSync(join(tmpDir, 'services'))

    writeFileSync(join(tmpDir, 'controllers', 'user.controller.ts'), [
      "import { prisma } from '../db/prisma.js'",
      'export function getUser() { return prisma.user.findMany() }',
    ].join('\n'))

    writeFileSync(join(tmpDir, 'services', 'mail.service.ts'), [
      "import express from 'express'",
      'export function sendMail() {',
      '  return express()',
      '}',
    ].join('\n'))

    writeFileSync(join(tmpDir, 'services', 'long.service.ts'), [
      'export function veryLong() {',
      ...Array.from({ length: 25 }, (_, i) => `  const v${i} = ${i}`),
      '  return 1',
      '}',
    ].join('\n'))

    const reports = analyzeProject(tmpDir, {
      architectureRules: {
        controllerNoDb: true,
        serviceNoHttp: true,
        maxFunctionLines: 8,
      },
    })

    const rules = reports.flatMap((report) => report.issues.map((issue) => issue.rule))
    expect(rules).toContain('controller-no-db')
    expect(rules).toContain('service-no-http')
    expect(rules).toContain('max-function-lines')
  }, 15000)

  it('generates architecture SVG map', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-map-'))
    mkdirSync(join(tmpDir, 'api'))
    mkdirSync(join(tmpDir, 'domain'))
    writeFileSync(join(tmpDir, 'domain', 'user.ts'), 'export const x = 1\n')
    writeFileSync(join(tmpDir, 'api', 'controller.ts'), "import { x } from '../domain/user.js'\nexport const y = x\n")

    const svg = generateArchitectureSvg(tmpDir)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('api')
    expect(svg).toContain('domain')
  })

  it('marks cycle and layer violation edges in architecture SVG', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-map-flags-'))
    mkdirSync(join(tmpDir, 'ui'))
    mkdirSync(join(tmpDir, 'api'))

    writeFileSync(join(tmpDir, 'ui', 'a.ts'), "import { b } from '../api/b.js'\nexport const a = b\n")
    writeFileSync(join(tmpDir, 'api', 'b.ts'), "import { a } from '../ui/a.js'\nexport const b = a\n")

    const svg = generateArchitectureSvg(tmpDir, {
      layers: [
        {
          name: 'ui',
          patterns: [`${tmpDir.replace(/\\/g, '/')}/ui/**`],
          canImportFrom: ['api'],
        },
        {
          name: 'api',
          patterns: [`${tmpDir.replace(/\\/g, '/')}/api/**`],
          canImportFrom: [],
        },
      ],
    })

    expect(svg).toContain('data-kind="cycle"')
    expect(svg).toContain('data-kind="violation"')
  })

  it('falls back safely when plugin cannot be loaded', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-plugin-fallback-'))
    writeFileSync(join(tmpDir, 'index.ts'), 'export const x = 1\n')

    const reports = analyzeProject(tmpDir, {
      plugins: ['./does-not-exist-plugin.js'],
    })

    const rules = reports.flatMap((report) => report.issues.map((issue) => issue.rule))
    expect(rules).toContain('plugin-error')
  })

  it('supports fix preview and write modes', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-fix-modes-'))
    const file = join(tmpDir, 'sample.ts')
    writeFileSync(file, "const x = 1\nconsole.log(x)\n")

    const preview = await applyFixes(file, undefined, { preview: true })
    expect(preview.length).toBeGreaterThan(0)
    expect(readFileSync(file, 'utf8')).toContain('console.log')

    const write = await applyFixes(file, undefined, { write: true })
    expect(write.length).toBeGreaterThan(0)
    expect(readFileSync(file, 'utf8')).not.toContain('console.log')
  })

  it('supports low-memory chunked analysis with cross-file rules', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-low-memory-'))
    writeFileSync(join(tmpDir, 'a.ts'), "import { b } from './b.js'\nexport const a = b\n")
    writeFileSync(join(tmpDir, 'b.ts'), "import { a } from './a.js'\nexport const b = a\n")

    const fullRules = new Set(analyzeProject(tmpDir).flatMap((report) => report.issues.map((issue) => issue.rule)))
    const lowMemoryRules = new Set(
      analyzeProject(tmpDir, undefined, { lowMemory: true, chunkSize: 1, includeSemanticDuplication: true })
        .flatMap((report) => report.issues.map((issue) => issue.rule)),
    )

    expect(fullRules.has('circular-dependency')).toBe(true)
    expect(lowMemoryRules.has('circular-dependency')).toBe(true)
  }, 30000)

  it('adds diagnostics when max file size guardrail skips files', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-max-file-size-'))
    writeFileSync(join(tmpDir, 'small.ts'), 'export const ok = 1\n')
    writeFileSync(join(tmpDir, 'big.ts'), `export const payload = '${'x'.repeat(5000)}'\n`)

    const reports = analyzeProject(tmpDir, undefined, { maxFileSizeKb: 1 })
    const skipIssues = reports.flatMap((report) => report.issues.filter((issue) => issue.rule === 'analysis-skip-file-size'))

    expect(skipIssues.length).toBeGreaterThan(0)
    expect(skipIssues[0].message).toContain('maxFileSizeKb')
  })

  it('adds diagnostics when max files guardrail skips files', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-max-files-'))
    writeFileSync(join(tmpDir, 'a.ts'), 'export const a = 1\n')
    writeFileSync(join(tmpDir, 'b.ts'), 'export const b = 2\n')
    writeFileSync(join(tmpDir, 'c.ts'), 'export const c = 3\n')

    const reports = analyzeProject(tmpDir, undefined, { maxFiles: 1 })
    const skipped = reports.flatMap((report) => report.issues.filter((issue) => issue.rule === 'analysis-skip-max-files'))

    expect(skipped).toHaveLength(2)
  })

  it('disables semantic duplication by default in low-memory mode but keeps opt-in', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'drift-low-memory-semantic-'))
    const functionA = [
      'export function same(x: number): number {',
      '  const a = x + 1',
      '  const b = a * 2',
      '  const c = b - 3',
      '  const d = c + 4',
      '  const e = d * 5',
      '  const f = e - 6',
      '  const g = f + 7',
      '  return g',
      '}',
    ].join('\n')
    const functionB = functionA
      .replace('same', 'same2')
      .replace(/\bx\b/g, 'n')

    writeFileSync(join(tmpDir, 'a.ts'), `${functionA}\n`)
    writeFileSync(join(tmpDir, 'b.ts'), `${functionB}\n`)

    const lowMemoryDefault = analyzeProject(tmpDir, undefined, { lowMemory: true })
      .flatMap((report) => report.issues.map((issue) => issue.rule))
    const lowMemoryWithSemantic = analyzeProject(tmpDir, undefined, {
      lowMemory: true,
      includeSemanticDuplication: true,
    }).flatMap((report) => report.issues.map((issue) => issue.rule))

    expect(lowMemoryDefault).not.toContain('semantic-duplication')
    expect(lowMemoryWithSemantic).toContain('semantic-duplication')
  })
})
