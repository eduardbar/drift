import { describe, expect, it, vi } from 'vitest'
import { resolveOutputFormat } from '../src/format.js'

describe('resolveOutputFormat', () => {
  it('defaults to console when no format flags are passed', () => {
    const format = resolveOutputFormat({
      command: 'scan',
      supported: ['console', 'json', 'markdown', 'ai', 'sarif'],
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
        supported: ['console', 'json', 'markdown', 'ai', 'sarif'],
        legacyAliases: [{ flag: 'ai', used: true, mapsTo: 'ai' }],
      }),
    ).toBe('ai')

    expect(
      resolveOutputFormat({
        command: 'trust',
        supported: ['console', 'json', 'markdown', 'sarif'],
        legacyAliases: [{ flag: 'markdown', used: true, mapsTo: 'markdown' }],
      }),
    ).toBe('markdown')

    expect(
      resolveOutputFormat({
        command: 'diff',
        supported: ['console', 'json', 'sarif'],
        legacyAliases: [{ flag: 'json', used: true, mapsTo: 'json' }],
      }),
    ).toBe('json')

    expect(
      resolveOutputFormat({
        command: 'ci',
        supported: ['console', 'json', 'sarif'],
        legacyAliases: [{ flag: 'json', used: true, mapsTo: 'json' }],
      }),
    ).toBe('json')
  })

  it('allows sarif when command supports it', () => {
    expect(
      resolveOutputFormat({
        command: 'scan',
        format: 'sarif',
        supported: ['console', 'json', 'markdown', 'ai', 'sarif'],
      }),
    ).toBe('sarif')

    expect(
      resolveOutputFormat({
        command: 'ci',
        format: 'sarif',
        supported: ['console', 'json', 'sarif'],
      }),
    ).toBe('sarif')

    expect(
      resolveOutputFormat({
        command: 'diff',
        format: 'sarif',
        supported: ['console', 'json', 'sarif'],
      }),
    ).toBe('sarif')

    expect(
      resolveOutputFormat({
        command: 'review',
        format: 'sarif',
        supported: ['console', 'json', 'markdown', 'sarif'],
      }),
    ).toBe('sarif')

    expect(
      resolveOutputFormat({
        command: 'trust',
        format: 'sarif',
        supported: ['console', 'json', 'markdown', 'sarif'],
      }),
    ).toBe('sarif')
  })

  it('fails on unsupported format per command', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'diff',
        format: 'markdown',
        supported: ['console', 'json', 'sarif'],
      }),
    ).toThrow("Format 'markdown' is not supported for 'diff'. Supported formats: console, json, sarif.")
  })

  it('fails when sarif is not supported by the command', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'guard',
        format: 'sarif',
        supported: ['console', 'json'],
      }),
    ).toThrow("Format 'sarif' is not supported for 'guard'. Supported formats: console, json.")
  })

  it('fails when legacy aliases conflict', () => {
    expect(() =>
      resolveOutputFormat({
        command: 'scan',
        supported: ['console', 'json', 'markdown', 'ai', 'sarif'],
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
        supported: ['console', 'json', 'markdown', 'sarif'],
        legacyAliases: [{ flag: 'markdown', used: true, mapsTo: 'markdown' }],
      }),
    ).toThrow("Conflicting format flags for 'trust': --format json and legacy alias for markdown.")
  })
})
