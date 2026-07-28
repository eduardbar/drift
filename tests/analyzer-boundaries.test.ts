import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { analyzeProject } from '../src/analyzer.js'

describe('analyzeProject generated-path boundaries', () => {
  it('does not analyze generated JavaScript under coverage', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'drift-coverage-boundary-'))
    try {
      mkdirSync(join(projectRoot, 'coverage'), { recursive: true })
      writeFileSync(join(projectRoot, 'coverage', 'generated.js'), 'console.log("coverage artifact")\n')

      const reports = analyzeProject(projectRoot)

      expect(reports.some((report) => report.path.includes('coverage'))).toBe(false)
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('continues analyzing ordinary JavaScript outside generated paths', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'drift-source-boundary-'))
    try {
      writeFileSync(join(projectRoot, 'source.js'), 'console.log("source code")\n')

      const reports = analyzeProject(projectRoot)

      expect(reports).toHaveLength(1)
      expect(reports[0]?.issues.map((issue) => issue.rule)).toContain('debug-leftover')
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
