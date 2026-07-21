import type { DiffSource } from './types/ai-guard.js'

export { runAIGuard } from './ai-guard-runner.js'

export function selectDiffSource(options: { stdin?: boolean; staged?: boolean; file?: string; base?: string }, stdinContent = ''): DiffSource {
  const selected = [options.stdin, options.staged, options.file != null, options.base != null].filter(Boolean).length
  if (selected !== 1) throw new Error('ai-guard requires exactly one diff source: --stdin, --staged, --file, or --base')
  if (options.stdin) return { kind: 'stdin', content: stdinContent }
  if (options.staged) return { kind: 'staged' }
  if (options.file != null) return { kind: 'file', path: options.file }
  return { kind: 'base', ref: options.base as string }
}
