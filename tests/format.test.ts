import { describe, expect, it, vi } from 'vitest'
import { resolveOutputFormat } from '../src/format.js'

describe('resolveOutputFormat', () => {
  it('defaults to console when no format flags are passed', () => {
    const format = resolveOutputFormat({
      command: 'scan',
      supported: ['console', 'json', 'markdown', 'ai'],
    })

    expect(format).toBe('console')
  })

  it('resolves from --format when supported', () => {
    const format = resolveOutputFormat({
      command: 'trust',
      format: 'markdown',
      supported: ['console', 'json', 'markdown'],
    })

    expect(format).toBe('markdown')
  })

  it('maps legacy aliases and emits deprecation warnings', () => {
    const onWarning = vi.fn()

    const format = resolveOutputFormat({
      command: 'review',
      supported: ['console', 'json', 'markdown'],
      legacyAliases: [{ flag: 'comment', used: true, mapsTo: 'markdown' }],
      onWarning,
    })

    expect(format).toBe('markdown')
    expect(onWarning).toHaveBeenCalledWith("Warning: --comment is deprecated for 'review'. Use --format markdown instead.")
  })

  it('covers legacy alias mapping per phase-1.4 command', () => {
    expect(
      resolveOutputFormat({
        command: 'scan',
        supported: ['console', 'json', 'markdown', 'ai'],
        legacyAliases: [{ flag: 'ai', used: true, mapsTo: 'ai' }],
      }),
    ).toBe('ai')

    expect(
      resolveOutputFormat({
        command: 'trust',
        supported: ['console', 'json', 'markdown'],
        legacyAliases: [{ flag: 'markdown', used: true, mapsTo: 'markdown' }],
      }),
    ).toBe('markdown')

    expect(
      resolveOutputFormat({
        command: 'diff',
        supported: ['console', 'json'],
        legacyAliases: [{ flag: 'json', used: true, mapsTo: 'json' }],
      }),
    ).toBe('json')

    expect(
      resolveOutputFormat({
        command: 'ci',
        supported: ['console', 'json'],
        legacyAliases: [{ flag: 'json', used: true, mapsTo: 'json' }],
      }),
    ).toBe('json')
  })

  it('fails on unsupported format per command', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'diff',
        format: 'markdown',
        supported: ['console', 'json'],
      }),
    ).toThrow("Format 'markdown' is not supported for 'diff'. Supported formats: console, json.")
  })

  it('fails with explicit placeholder message for sarif in phase 1', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'scan',
        format: 'sarif',
        supported: ['console', 'json', 'markdown', 'ai'],
      }),
    ).toThrow("'scan' --format sarif is a phase 1 placeholder and is not implemented yet.")
  })

  it('fails when legacy aliases conflict', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'scan',
        supported: ['console', 'json', 'markdown', 'ai'],
        legacyAliases: [
          { flag: 'json', used: true, mapsTo: 'json' },
          { flag: 'ai', used: true, mapsTo: 'ai' },
        ],
      }),
    ).toThrow("Conflicting legacy format flags for 'scan': json vs ai. Use a single format option.")
  })

  it('fails when --format conflicts with a legacy alias', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'trust',
        format: 'json',
        supported: ['console', 'json', 'markdown'],
        legacyAliases: [{ flag: 'markdown', used: true, mapsTo: 'markdown' }],
      }),
    ).toThrow("Conflicting format flags for 'trust': --format json and legacy alias for markdown.")
  })
})
