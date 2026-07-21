import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Phase 5 public documentation', () => {
  it('documents the AI integration happy path and local boundary', () => {
    const readme = readFileSync('README.md', 'utf8')

    expect(readme).toContain('### `drift context [path]`')
    expect(readme).toContain('### `drift mcp [path]`')
    expect(readme).toContain('### `drift ai-guard [path]`')
    expect(readme).toContain('.drift/context.md')
    const configMatch = readme.match(/OpenCode configuration[\s\S]*?```json\s*([\s\S]*?)```/i)
    expect(configMatch, 'OpenCode JSON configuration example is missing').not.toBeNull()
    const config = JSON.parse(configMatch![1])
    const server = config.mcp.drift
    expect(server).toEqual({ type: 'local', command: ['drift', 'mcp', '.'] })

    for (const flag of ['--stdin', '--staged', '--diff-file', '--base', '--budget', '--block-on']) {
      expect(readme).toContain(flag)
    }
    expect(readme).toMatch(/exit behavior is deterministic/i)
    expect(readme).toMatch(/0.*passes|0.*pass/i)
    expect(readme).toMatch(/1.*rejects|1.*block/i)
    expect(readme).toMatch(/2.*invalid|2.*input/i)
    expect(readme).toMatch(/local.*no network|no network.*local/i)
    expect(readme).toMatch(/no API key|no cloud service/i)

    const changelog = readFileSync('CHANGELOG.md', 'utf8')
    expect(changelog).toMatch(/Unreleased/i)
    expect(changelog).toMatch(/context.*mcp.*ai-guard|ai-guard.*mcp.*context/i)
    expect(changelog).toMatch(/OpenCode|local|no-cost/i)
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
