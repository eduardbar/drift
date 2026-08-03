import { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import {
  addResourceOptions,
  parseBySeverity,
  parseOptionalNumber,
  resolveAnalysisOptions,
} from '../src/cli-options.js'

describe('CLI option parsing contracts', () => {
  it('resolves resource flags without changing their defaults or boolean semantics', () => {
    expect(resolveAnalysisOptions({})).toEqual({
      lowMemory: undefined,
      chunkSize: undefined,
      maxFiles: undefined,
      maxFileSizeKb: undefined,
      includeSemanticDuplication: undefined,
    })
    expect(resolveAnalysisOptions({
      lowMemory: true,
      chunkSize: '40',
      maxFiles: '10',
      maxFileSizeKb: '256',
      withSemanticDuplication: true,
    })).toEqual({
      lowMemory: true,
      chunkSize: 40,
      maxFiles: 10,
      maxFileSizeKb: 256,
      includeSemanticDuplication: true,
    })
  })

  it('preserves non-negative integer validation and exact errors', () => {
    expect(resolveAnalysisOptions({ maxFiles: '0' }).maxFiles).toBe(0)
    expect(() => resolveAnalysisOptions({ maxFiles: '-1' })).toThrow('--max-files must be a non-negative integer')
    expect(() => resolveAnalysisOptions({ maxFiles: '1.5' })).toThrow('--max-files must be a non-negative integer')
  })

  it('preserves finite number parsing and exact errors', () => {
    expect(parseOptionalNumber('2.5', '--budget')).toBe(2.5)
    expect(parseOptionalNumber(undefined, '--budget')).toBeUndefined()
    expect(() => parseOptionalNumber('Infinity', '--budget')).toThrow('--budget must be a valid number')
    expect(() => parseOptionalNumber('NaN', '--budget')).toThrow('--budget must be a valid number')
  })

  it('parses severity thresholds and preserves validation messages', () => {
    expect(parseBySeverity(' error=0, warning=2, info=5 ')).toEqual({ error: 0, warning: 2, info: 5 })
    expect(parseBySeverity('warning=2,')).toEqual({ warning: 2 })
    expect(() => parseBySeverity('warning=2,warning=nope')).toThrow("Duplicate --by-severity key 'warning'.")
    expect(() => parseBySeverity('')).toThrow('--by-severity must not be empty. Expected format: error=0,warning=2,info=5')
    expect(() => parseBySeverity('warning=2,warning=3')).toThrow("Duplicate --by-severity key 'warning'.")
    expect(() => parseBySeverity('debug=1')).toThrow("Invalid --by-severity key 'debug'. Allowed keys: error, warning, info.")
    expect(() => parseBySeverity('warning=nope')).toThrow("Invalid --by-severity value for 'warning': 'nope'. Must be a valid number.")
    expect(() => parseBySeverity('warning')).toThrow("Invalid --by-severity entry 'warning'. Expected key=value (e.g. warning=2).")
    expect(() => parseBySeverity('warning=')).toThrow("Invalid --by-severity entry 'warning='. Expected key=value (e.g. warning=2).")
    expect(() => parseBySeverity(',,')).toThrow('--by-severity must include at least one threshold. Example: error=0,warning=2')
  })

  it('keeps the shared resource option wiring and help text intact', () => {
    const command = addResourceOptions(new Command('probe'))
    const help = command.helpInformation()
    expect(help).toContain('--low-memory')
    expect(help).toContain('--chunk-size <n>')
    expect(help).toContain('Files per chunk in low-memory mode (default: 40)')
    expect(help).toContain('--with-semantic-duplication')
  })
})
