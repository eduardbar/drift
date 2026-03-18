import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { TrustKpiDiagnostic } from './types.js'
import type { DiscoverResult } from './trust-kpi-types.js'

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.next', 'build'])

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function processDirectoryEntry(current: string, entry: string, stack: string[], out: string[]): void {
  const fullPath = resolve(current, entry)
  const info = statSync(fullPath)
  if (!info.isDirectory()) {
    out.push(fullPath)
    return
  }

  if (IGNORED_DIRECTORIES.has(entry)) return
  stack.push(fullPath)
}

function listFilesRecursively(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      processDirectoryEntry(current, entry, stack, out)
    }
  }

  return out
}

function isGlobPattern(input: string): boolean {
  return /[*?[\]{}]/.test(input)
}

function escapeRegex(char: string): string {
  return /[\\^$+?.()|{}\[\]]/.test(char) ? `\\${char}` : char
}

function globToRegex(pattern: string): RegExp {
  const normalized = toPosixPath(pattern)
  let expression = '^'

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const nextChar = normalized[index + 1]
    const nextNextChar = normalized[index + 2]

    if (char === '*' && nextChar === '*') {
      if (nextNextChar === '/') {
        expression += '(?:.*/)?'
        index += 2
        continue
      }
      expression += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      expression += '[^/]*'
      continue
    }

    if (char === '?') {
      expression += '[^/]'
      continue
    }

    expression += escapeRegex(char)
  }

  expression += '$'
  return new RegExp(expression)
}

function globBaseDir(pattern: string): string {
  const normalized = toPosixPath(pattern)
  const wildcardIndex = normalized.search(/[*?[\]{}]/)

  if (wildcardIndex < 0) return dirname(pattern)

  const prefix = normalized.slice(0, wildcardIndex)
  const slashIndex = prefix.lastIndexOf('/')

  if (slashIndex < 0) return '.'
  if (slashIndex === 0) return '/'

  return prefix.slice(0, slashIndex)
}

function discoverFromGlob(source: string, cwd: string): DiscoverResult {
  const diagnostics: TrustKpiDiagnostic[] = []
  const absolutePattern = isAbsolute(source) ? source : resolve(cwd, source)
  const regex = globToRegex(toPosixPath(absolutePattern))
  const base = resolve(cwd, globBaseDir(source))

  if (!existsSync(base)) {
    diagnostics.push({
      level: 'error',
      code: 'path-not-found',
      message: `Glob base path does not exist: ${base}`,
    })
    return { files: [], diagnostics }
  }

  const matched = listFilesRecursively(base)
    .filter((filePath) => regex.test(toPosixPath(filePath)))
    .filter((filePath) => filePath.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))

  return { files: matched, diagnostics }
}

function discoverFromPath(source: string, cwd: string): DiscoverResult {
  const diagnostics: TrustKpiDiagnostic[] = []
  const absolute = isAbsolute(source) ? source : resolve(cwd, source)

  if (!existsSync(absolute)) {
    diagnostics.push({
      level: 'error',
      code: 'path-not-found',
      message: `Path does not exist: ${absolute}`,
    })
    return { files: [], diagnostics }
  }

  const info = statSync(absolute)
  if (info.isDirectory()) {
    const files = listFilesRecursively(absolute)
      .filter((filePath) => filePath.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b))
    return { files, diagnostics }
  }

  if (info.isFile()) {
    if (!absolute.toLowerCase().endsWith('.json')) {
      diagnostics.push({
        level: 'warning',
        code: 'path-not-supported',
        file: absolute,
        message: 'Input file is not JSON; attempting to parse anyway',
      })
    }
    return { files: [absolute], diagnostics }
  }

  diagnostics.push({
    level: 'error',
    code: 'path-not-supported',
    message: `Path is neither a file nor directory: ${absolute}`,
  })

  return { files: [], diagnostics }
}

export function discoverTrustJsonFiles(input: string, cwd: string): DiscoverResult {
  const source = input.trim() || '.'
  return isGlobPattern(source)
    ? discoverFromGlob(source, cwd)
    : discoverFromPath(source, cwd)
}
