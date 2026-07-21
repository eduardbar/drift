import { join } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport } from './reporter.js'
import { parseUnifiedDiff } from './ai-guard-diff.js'
import { assembleAIGuardResult, computeAIGuardResult, enforceBlockOn, enforceBudget } from './ai-guard-results.js'
import { createAIGuardRoot, materializeAfter, prepareBaseline, readSelectedDiff } from './ai-guard-workspace.js'
import { withCleanupGuardian } from './ai-guard-guardian.js'
import type { AIGuardOptions, AIGuardResult } from './types/ai-guard.js'

const DEFAULT_BUDGET = 0

function changedFiles(entries: ReturnType<typeof parseUnifiedDiff>): string[] {
  return [...new Set(entries.flatMap(entry => [entry.oldPath, entry.newPath].filter((path): path is string => Boolean(path))))].sort()
}

export async function runAIGuard(options: AIGuardOptions): Promise<AIGuardResult> {
  const root = createAIGuardRoot()
  return withCleanupGuardian(root, async signal => {
    const diff = readSelectedDiff(options.projectPath, options.source)
    if (!diff.trim()) throw new Error('The selected diff source is empty')
    const entries = parseUnifiedDiff(diff)
    const prepared = prepareBaseline(options.projectPath, options.source, root)
    try {
      const afterPath = join(root, 'after')
      materializeAfter(prepared.before, afterPath, entries)
      const beforeReport = buildReport(prepared.before, analyzeProject(prepared.before, options.config, options.analysisOptions))
      const afterReport = buildReport(afterPath, analyzeProject(afterPath, options.config, options.analysisOptions))
      const delta = computeAIGuardResult(beforeReport.files, afterReport.files, { before: prepared.before, after: afterPath })
      const budget = enforceBudget(delta.scoreDelta, options.budget ?? DEFAULT_BUDGET)
      const block = enforceBlockOn(delta.newIssues, options.blockOn)
      const result = assembleAIGuardResult({
        delta,
        source: options.source.kind,
        files: changedFiles(entries),
        budget,
        block,
        includeSuggestions: Boolean(options.suggestions),
      })
      const interrupted = signal()
      if (interrupted) result.reason = `interrupted by ${interrupted}`
      return result
    } finally {
      prepared.cleanup()
    }
  })
}
