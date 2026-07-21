import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Phase 5 public documentation', () => {
  it('documents the AI integration happy path and local boundary', () => {
    const readme = readFileSync('README.md', 'utf8')

    expect(readme).toContain('### `drift context [path]`')
    expect(readme).toContain('### `drift mcp [path]`')
    expect(readme).toContain('### `drift ai-guard [path]`')
    expect(readme).toContain('.drift/context.md')
    expect(readme).toContain('OpenCode')
    expect(readme).toMatch(/local|sin coste|no-cost/i)
    expect(readme).toContain('--budget')
    expect(readme).toContain('--block-on')
  })

  it('keeps the command inventory and architecture pointers current for contributors', () => {
    const agents = readFileSync('AGENTS.md', 'utf8')

    expect(agents).toContain('- `context [path]`')
    expect(agents).toContain('- `mcp [path]`')
    expect(agents).toContain('- `ai-guard [path]`')
    expect(agents).toContain('src/context.ts')
    expect(agents).toContain('src/mcp-server.ts')
    expect(agents).toContain('src/ai-guard.ts')
  })
})
