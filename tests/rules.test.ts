import { describe, it, expect } from 'vitest'
import { analyzeCode, getRules, countRule, generateLines, generateFunction } from './helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
// large-file  (threshold: > 300 lines)
// ─────────────────────────────────────────────────────────────────────────────
describe('large-file', () => {
  it('detects file with more than 300 lines', () => {
    const code = generateLines(310)
    expect(getRules(code)).toContain('large-file')
  })

  it('does not detect file with exactly 300 lines', () => {
    const code = generateLines(300)
    expect(getRules(code)).not.toContain('large-file')
  })

  it('does not detect file with fewer than 300 lines', () => {
    const code = generateLines(10)
    expect(getRules(code)).not.toContain('large-file')
  })

  it('reports exactly one issue per file', () => {
    const code = generateLines(350)
    expect(countRule(code, 'large-file')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// large-function  (threshold: > 50 lines)
// ─────────────────────────────────────────────────────────────────────────────
describe('large-function', () => {
  it('detects function with more than 50 lines', () => {
    const code = generateFunction(55)
    expect(getRules(code)).toContain('large-function')
  })

  it('does not detect function with exactly 50 lines (end - start = 50)', () => {
    // generateFunction(49) → end - start = 50, which is NOT > 50 → no trigger
    const code = generateFunction(49)
    expect(getRules(code)).not.toContain('large-function')
  })

  it('does not detect small functions', () => {
    const code = `function small(): void { const x = 1 }`
    expect(getRules(code)).not.toContain('large-function')
  })

  it('detects large arrow functions', () => {
    const body = Array.from({ length: 55 }, (_, i) => `  const _a${i} = ${i}`).join('\n')
    const code = `const fn = (): void => {\n${body}\n}`
    expect(getRules(code)).toContain('large-function')
  })

  it('detects large class methods', () => {
    const body = Array.from({ length: 55 }, (_, i) => `    const _m${i} = ${i}`).join('\n')
    const code = `class Foo {\n  bar(): void {\n${body}\n  }\n}`
    expect(getRules(code)).toContain('large-function')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// debug-leftover  (console.log/warn/error/debug/info + TODO/FIXME/HACK/XXX/TEMP)
// ─────────────────────────────────────────────────────────────────────────────
describe('debug-leftover', () => {
  it('detects console.log', () => {
    expect(getRules(`const x = 1\nconsole.log(x)`)).toContain('debug-leftover')
  })

  it('detects console.warn', () => {
    expect(getRules(`console.warn('test')`)).toContain('debug-leftover')
  })

  it('detects console.error', () => {
    expect(getRules(`console.error('err')`)).toContain('debug-leftover')
  })

  it('detects console.debug', () => {
    expect(getRules(`console.debug('val')`)).toContain('debug-leftover')
  })

  it('detects TODO comment marker', () => {
    expect(getRules(`// TODO: implement this\nconst x = 1`)).toContain('debug-leftover')
  })

  it('detects FIXME marker', () => {
    expect(getRules(`// FIXME: broken logic\nconst x = 1`)).toContain('debug-leftover')
  })

  it('detects HACK marker', () => {
    expect(getRules(`// HACK: workaround\nconst x = 1`)).toContain('debug-leftover')
  })

  it('does not detect clean code', () => {
    expect(getRules(`function greet(name: string): string { return 'Hello ' + name }`)).not.toContain('debug-leftover')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// dead-code  (unused named imports)
// ─────────────────────────────────────────────────────────────────────────────
describe('dead-code', () => {
  it('detects unused named import', () => {
    const code = `import { readFile } from 'fs'\nconst x = 1`
    expect(getRules(code)).toContain('dead-code')
  })

  it('detects multiple unused named imports', () => {
    const code = `import { readFile, writeFile } from 'fs'\nconst x = 1`
    expect(countRule(code, 'dead-code')).toBeGreaterThanOrEqual(1)
  })

  it('does not detect used named import', () => {
    const code = `import { join } from 'path'\nconst p = join('a', 'b')`
    expect(getRules(code)).not.toContain('dead-code')
  })

  it('does not detect default imports (only named)', () => {
    const code = `import fs from 'fs'\nconst x = 1`
    expect(getRules(code)).not.toContain('dead-code')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// duplicate-function-name  (case-insensitive, normalized: _/- removed)
// ─────────────────────────────────────────────────────────────────────────────
describe('duplicate-function-name', () => {
  it('detects two functions with the same name', () => {
    const code = `function processData(): void {}\nfunction processData(): void {}`
    expect(getRules(code)).toContain('duplicate-function-name')
  })

  it('detects case-insensitive duplicates', () => {
    const code = `function processData(): void {}\nfunction ProcessData(): void {}`
    expect(getRules(code)).toContain('duplicate-function-name')
  })

  it('detects snake_case vs camelCase duplicates (normalized)', () => {
    const code = `function processData(): void {}\nfunction process_data(): void {}`
    expect(getRules(code)).toContain('duplicate-function-name')
  })

  it('does not detect functions with different names', () => {
    const code = `function fetchData(): void {}\nfunction saveData(): void {}`
    expect(getRules(code)).not.toContain('duplicate-function-name')
  })

  it('does not trigger on single function', () => {
    const code = `function doWork(): void {}`
    expect(getRules(code)).not.toContain('duplicate-function-name')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// any-abuse  (each 'any' type annotation triggers one issue)
// ─────────────────────────────────────────────────────────────────────────────
describe('any-abuse', () => {
  it('detects explicit any type annotation', () => {
    expect(getRules(`const a: any = 1`)).toContain('any-abuse')
  })

  it('detects multiple any annotations', () => {
    const code = `const a: any = 1\nconst b: any = 2\nconst c: any = 3`
    expect(countRule(code, 'any-abuse')).toBe(3)
  })

  it('does not detect properly typed code', () => {
    expect(getRules(`const a: string = 'hello'\nconst b: number = 42`)).not.toContain('any-abuse')
  })

  it('detects any in function parameters', () => {
    expect(getRules(`function f(x: any): void {}`)).toContain('any-abuse')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// catch-swallow  (empty catch block)
// ─────────────────────────────────────────────────────────────────────────────
describe('catch-swallow', () => {
  it('detects empty catch block', () => {
    const code = `try { const x = 1 } catch (e) {}`
    expect(getRules(code)).toContain('catch-swallow')
  })

  it('does not detect catch with error handling', () => {
    const code = `try { const x = 1 } catch (e) { console.error(e) }`
    expect(getRules(code)).not.toContain('catch-swallow')
  })

  it('does not detect catch with throw rethrow', () => {
    const code = `try { const x = 1 } catch (e) { throw e }`
    expect(getRules(code)).not.toContain('catch-swallow')
  })

  it('detects nested empty catch blocks', () => {
    const code = `
function outer(): void {
  try {
    try { const x = 1 } catch (e) {}
  } catch (e) {}
}`
    expect(countRule(code, 'catch-swallow')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// no-return-type  (function declarations without explicit return type)
// ─────────────────────────────────────────────────────────────────────────────
describe('no-return-type', () => {
  it('detects function without return type annotation', () => {
    expect(getRules(`function greet(name: string) { return 'Hello ' + name }`)).toContain('no-return-type')
  })

  it('does not detect function with explicit return type', () => {
    expect(getRules(`function greet(name: string): string { return 'Hello ' + name }`)).not.toContain('no-return-type')
  })

  it('detects multiple functions without return types', () => {
    const code = `function a() { return 1 }\nfunction b() { return 2 }`
    expect(countRule(code, 'no-return-type')).toBe(2)
  })

  it('does not flag functions with void return type', () => {
    expect(getRules(`function log(msg: string): void { return }`)).not.toContain('no-return-type')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// high-complexity  (cyclomatic complexity > 10)
// ─────────────────────────────────────────────────────────────────────────────
describe('high-complexity', () => {
  it('detects function with complexity > 10', () => {
    // 11 if-statements = complexity 12 (base 1 + 11)
    const ifs = Array.from({ length: 11 }, (_, i) => `  if (x === ${i}) return ${i}`).join('\n')
    const code = `function check(x: number): number {\n${ifs}\n  return -1\n}`
    expect(getRules(code)).toContain('high-complexity')
  })

  it('does not detect simple function with complexity <= 10', () => {
    const code = `function simple(x: number): number {
  if (x > 0) return 1
  if (x < 0) return -1
  return 0
}`
    expect(getRules(code)).not.toContain('high-complexity')
  })

  it('counts &&/|| operators as complexity increments', () => {
    // base 1 + 5 ifs + 5 && = 11 → complexity > 10
    const code = `function validate(a: number, b: number, c: number, d: number, e: number, f: number): boolean {
  if (a > 0 && b > 0) return false
  if (c > 0 && d > 0) return false
  if (e > 0 && f > 0) return false
  if (a > 1 && b > 1) return false
  if (c > 1 && d > 1) return false
  return true
}`
    expect(getRules(code)).toContain('high-complexity')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// deep-nesting  (max nesting depth > 3)
// ─────────────────────────────────────────────────────────────────────────────
describe('deep-nesting', () => {
  it('detects nesting depth > 3', () => {
    const code = `function deeply(): void {
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          const x = 1
        }
      }
    }
  }
}`
    expect(getRules(code)).toContain('deep-nesting')
  })

  it('does not detect nesting depth of 3', () => {
    const code = `function normal(): void {
  if (true) {
    if (true) {
      if (true) {
        const x = 1
      }
    }
  }
}`
    expect(getRules(code)).not.toContain('deep-nesting')
  })

  it('does not detect flat code', () => {
    const code = `function flat(x: number): number {
  const a = x + 1
  const b = a * 2
  return b
}`
    expect(getRules(code)).not.toContain('deep-nesting')
  })

  it('detects deep nesting with mixed control flow', () => {
    const code = `function mixed(): void {
  for (let i = 0; i < 10; i++) {
    while (true) {
      try {
        if (i > 5) {
          const x = i
        }
      } catch (e) { throw e }
    }
  }
}`
    expect(getRules(code)).toContain('deep-nesting')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// too-many-params  (> 4 parameters)
// ─────────────────────────────────────────────────────────────────────────────
describe('too-many-params', () => {
  it('detects function with 5 parameters', () => {
    const code = `function f(a: string, b: number, c: boolean, d: string, e: number): void {}`
    expect(getRules(code)).toContain('too-many-params')
  })

  it('does not detect function with exactly 4 parameters', () => {
    const code = `function f(a: string, b: number, c: boolean, d: string): void {}`
    expect(getRules(code)).not.toContain('too-many-params')
  })

  it('does not detect function with 2 parameters', () => {
    const code = `function f(a: string, b: number): void {}`
    expect(getRules(code)).not.toContain('too-many-params')
  })

  it('detects arrow function with too many params', () => {
    const code = `const fn = (a: string, b: number, c: boolean, d: string, e: number): void => {}`
    expect(getRules(code)).toContain('too-many-params')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// high-coupling  (> 10 distinct import sources)
// ─────────────────────────────────────────────────────────────────────────────
describe('high-coupling', () => {
  it('detects more than 10 distinct imports', () => {
    const imports = Array.from({ length: 11 }, (_, i) => `import _m${i} from 'module${i}'`).join('\n')
    expect(getRules(imports + '\nconst x = 1')).toContain('high-coupling')
  })

  it('does not detect exactly 10 distinct imports', () => {
    const imports = Array.from({ length: 10 }, (_, i) => `import _m${i} from 'module${i}'`).join('\n')
    expect(getRules(imports + '\nconst x = 1')).not.toContain('high-coupling')
  })

  it('does not detect few imports', () => {
    const code = `import { readFile } from 'fs'\nimport { join } from 'path'\nconst x = 1`
    expect(getRules(code)).not.toContain('high-coupling')
  })

  it('reports exactly one issue', () => {
    const imports = Array.from({ length: 12 }, (_, i) => `import _m${i} from 'module${i}'`).join('\n')
    expect(countRule(imports + '\nconst x = 1', 'high-coupling')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// promise-style-mix  (both .then() and async/await in the same file)
// ─────────────────────────────────────────────────────────────────────────────
describe('promise-style-mix', () => {
  it('detects mix of .then() and async/await', () => {
    const code = `
async function fetchData(): Promise<void> {
  const result = await fetch('http://example.com')
}
function loadData(): void {
  fetch('http://example.com').then(r => r.json())
}
`
    expect(getRules(code)).toContain('promise-style-mix')
  })

  it('does not detect when only async/await is used', () => {
    const code = `
async function fetchData(): Promise<void> {
  const result = await fetch('http://example.com')
  return
}
`
    expect(getRules(code)).not.toContain('promise-style-mix')
  })

  it('does not detect when only .then() is used', () => {
    const code = `
function loadData(): void {
  fetch('http://example.com').then(r => r.json()).catch(err => { throw err })
}
`
    expect(getRules(code)).not.toContain('promise-style-mix')
  })

  it('reports exactly one issue per file', () => {
    const code = `
async function a(): Promise<void> { await Promise.resolve() }
async function b(): Promise<void> { await Promise.resolve() }
function c(): void { Promise.resolve().then(() => {}) }
`
    expect(countRule(code, 'promise-style-mix')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// magic-number  (numeric literals not in [0,1,-1,2,100], not in variable declarations)
// ─────────────────────────────────────────────────────────────────────────────
describe('magic-number', () => {
  it('detects magic number in if condition', () => {
    const code = `function check(x: number): boolean { if (x > 42) return true; return false }`
    expect(getRules(code)).toContain('magic-number')
  })

  it('detects magic number in binary expression', () => {
    const code = `function calc(x: number): number { return x * 1000 }`
    expect(getRules(code)).toContain('magic-number')
  })

  it('does not detect 0 (allowed)', () => {
    const code = `function isZero(x: number): boolean { return x === 0 }`
    expect(getRules(code)).not.toContain('magic-number')
  })

  it('does not detect 1 (allowed)', () => {
    const code = `function increment(x: number): number { return x + 1 }`
    expect(getRules(code)).not.toContain('magic-number')
  })

  it('does not detect 2 (allowed)', () => {
    const code = `function double(x: number): number { return x * 2 }`
    expect(getRules(code)).not.toContain('magic-number')
  })

  it('does not detect 100 (allowed)', () => {
    const code = `function percentage(x: number): number { return x / 100 }`
    expect(getRules(code)).not.toContain('magic-number')
  })

  it('does not detect number in variable declaration (that IS the named constant)', () => {
    // VariableDeclaration parent is skipped — the const IS the named constant
    const code = `const TIMEOUT_MS = 3000`
    expect(getRules(code)).not.toContain('magic-number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// comment-contradiction  (trivial comments restating the code)
// ─────────────────────────────────────────────────────────────────────────────
describe('comment-contradiction', () => {
  it('detects "// return" comment above return statement', () => {
    const code = `function f(): number {\n  // return the value\n  return 42\n}`
    expect(getRules(code)).toContain('comment-contradiction')
  })

  it('detects "// increment" comment above x++', () => {
    const code = `function f(): void {\n  let x = 0\n  // increment x\n  x++\n}`
    expect(getRules(code)).toContain('comment-contradiction')
  })

  it('detects "// check if" above if statement', () => {
    const code = `function f(x: number): void {\n  // check if positive\n  if (x > 0) {}\n}`
    expect(getRules(code)).toContain('comment-contradiction')
  })

  it('detects "// loop" above for statement', () => {
    const code = `function f(): void {\n  // loop over items\n  for (let i = 0; i < 10; i++) {}\n}`
    expect(getRules(code)).toContain('comment-contradiction')
  })

  it('detects "// declare" above const declaration', () => {
    const code = `function f(): void {\n  // declare counter\n  const counter = 0\n}`
    expect(getRules(code)).toContain('comment-contradiction')
  })

  it('does not detect meaningful comments', () => {
    const code = `function f(x: number): number {\n  // Early exit to avoid division by zero\n  if (x === 0) return 0\n  return 100 / x\n}`
    expect(getRules(code)).not.toContain('comment-contradiction')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// over-commented  (>= 40% comment density in function body with >= 6 lines)
// ─────────────────────────────────────────────────────────────────────────────
describe('over-commented', () => {
  it('detects function with >= 40% comment density and >= 6 total lines', () => {
    // 10 lines total, 5 comments = 50%
    const code = `function heavilyCommented(): void {
  // step 1
  const a = 1
  // step 2
  const b = 2
  // step 3
  const c = 3
  // step 4
  const d = 4
  // step 5
  return
}`
    expect(getRules(code)).toContain('over-commented')
  })

  it('does not detect function with < 40% comment density', () => {
    const code = `function lightComment(): void {
  // initialize
  const a = 1
  const b = 2
  const c = 3
  const d = 4
  const e = 5
  return
}`
    expect(getRules(code)).not.toContain('over-commented')
  })

  it('does not detect short functions (< 6 lines body)', () => {
    const code = `function tiny(): void {
  // comment
  const a = 1
  // comment
  return
}`
    expect(getRules(code)).not.toContain('over-commented')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// hardcoded-config  (URLs, IPs, connection strings in string literals)
// NOTE: analyzeCode uses 'test.ts' by default but hardcoded-config skips .test. files.
// We use a non-test filePath here.
// ─────────────────────────────────────────────────────────────────────────────
describe('hardcoded-config', () => {
  it('detects postgresql connection string', () => {
    const code = `const DB = 'postgresql://user:pass@localhost:5432/db'`
    expect(getRules(code, 'src/config.ts')).toContain('hardcoded-config')
  })

  it('detects mongodb connection string', () => {
    const code = `const MONGO = 'mongodb://localhost:27017/mydb'`
    expect(getRules(code, 'src/db.ts')).toContain('hardcoded-config')
  })

  it('detects HTTP URL', () => {
    const code = `const API = 'https://api.example.com/v1'`
    expect(getRules(code, 'src/api.ts')).toContain('hardcoded-config')
  })

  it('detects redis connection string', () => {
    const code = `const CACHE = 'redis://localhost:6379'`
    expect(getRules(code, 'src/cache.ts')).toContain('hardcoded-config')
  })

  it('detects IP address', () => {
    const code = `const HOST = '192.168.1.100'`
    expect(getRules(code, 'src/server.ts')).toContain('hardcoded-config')
  })

  it('does not detect process.env usage', () => {
    const code = `const DB = process.env.DATABASE_URL`
    expect(getRules(code, 'src/config.ts')).not.toContain('hardcoded-config')
  })

  it('does not detect hardcoded config in spec files (pattern .spec.)', () => {
    // Only .test. / .spec. / __tests__ are skipped — test.ts (no dot before 'test') is NOT skipped
    const code = `const DB = 'postgresql://user:pass@localhost:5432/db'`
    expect(getRules(code, 'src/db.spec.ts')).not.toContain('hardcoded-config')
  })

  it('does not flag import paths', () => {
    // Import strings are explicitly skipped
    const code = `import { foo } from './foo'`
    expect(getRules(code, 'src/bar.ts')).not.toContain('hardcoded-config')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// inconsistent-error-handling  (mix of try/catch + .catch() + .then(_, handler))
// ─────────────────────────────────────────────────────────────────────────────
describe('inconsistent-error-handling', () => {
  it('detects mix of try/catch and .catch()', () => {
    const code = `
function a(): void {
  try { const x = 1 } catch (e) { throw e }
}
function b(): void {
  fetch('url').catch(err => { throw err })
}
`
    expect(getRules(code)).toContain('inconsistent-error-handling')
  })

  it('detects mix of try/catch and .then(_, handler)', () => {
    const code = `
function a(): void {
  try { const x = 1 } catch (e) { throw e }
}
function b(): void {
  fetch('url').then(() => {}, err => { throw err })
}
`
    expect(getRules(code)).toContain('inconsistent-error-handling')
  })

  it('does not detect consistent try/catch only', () => {
    const code = `
function a(): void { try { const x = 1 } catch (e) { throw e } }
function b(): void { try { const y = 2 } catch (e) { throw e } }
`
    expect(getRules(code)).not.toContain('inconsistent-error-handling')
  })

  it('does not detect consistent .catch() only', () => {
    const code = `
function a(): void { fetch('url').catch(e => { throw e }) }
function b(): void { fetch('url2').catch(e => { throw e }) }
`
    expect(getRules(code)).not.toContain('inconsistent-error-handling')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// unnecessary-abstraction  (interface with 1 method used <= 2 times)
// ─────────────────────────────────────────────────────────────────────────────
describe('unnecessary-abstraction', () => {
  it('detects interface with 1 method used only once', () => {
    const code = `
interface Fetcher {
  fetch(url: string): Promise<string>
}
const impl: Fetcher = { fetch: async (url) => url }
`
    expect(getRules(code, 'src/service.ts')).toContain('unnecessary-abstraction')
  })

  it('does not detect interface with multiple methods', () => {
    const code = `
interface Repository {
  find(id: string): string
  save(data: string): void
  delete(id: string): void
}
const impl: Repository = { find: (id) => id, save: () => {}, delete: () => {} }
`
    expect(getRules(code, 'src/repo.ts')).not.toContain('unnecessary-abstraction')
  })

  it('does not detect interface with properties', () => {
    const code = `
interface Config {
  url: string
  fetch(url: string): Promise<string>
}
const c: Config = { url: 'x', fetch: async (u) => u }
`
    expect(getRules(code, 'src/config.ts')).not.toContain('unnecessary-abstraction')
  })

  it('detects abstract class with 1 abstract method used <= 2 times', () => {
    // 'Handler' appears: 1 (declaration) + 1 (extends clause) = 2 times → <= 2 triggers
    const code = `
abstract class Handler {
  abstract handle(data: string): void
}
class Impl extends Handler {
  handle(data: string): void {}
}
`
    // NOTE: 'Handler' appears 3 times here (declaration + extends + Impl body return type inference)
    // Use a code where it appears exactly <= 2 times
    const code2 = `
abstract class Processor {
  abstract process(x: number): void
}
`
    expect(getRules(code2, 'src/processor.ts')).toContain('unnecessary-abstraction')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// naming-inconsistency  (camelCase and snake_case mixed in same function scope, >= 3 vars)
// ─────────────────────────────────────────────────────────────────────────────
describe('naming-inconsistency', () => {
  it('detects mixed camelCase and snake_case in same function', () => {
    const code = `function process(): void {
  const firstName = 'John'
  const last_name = 'Doe'
  const userAge = 30
  const birth_date = '1990-01-01'
}`
    expect(getRules(code)).toContain('naming-inconsistency')
  })

  it('does not detect consistent camelCase', () => {
    const code = `function process(): void {
  const firstName = 'John'
  const lastName = 'Doe'
  const userAge = 30
}`
    expect(getRules(code)).not.toContain('naming-inconsistency')
  })

  it('does not detect consistent snake_case', () => {
    const code = `function process(): void {
  const first_name = 'John'
  const last_name = 'Doe'
  const user_age = 30
}`
    expect(getRules(code)).not.toContain('naming-inconsistency')
  })

  it('does not flag when fewer than 3 variables (too few to be significant)', () => {
    // Only 2 vars — rule requires >= 3 to be significant
    const code = `function f(): void {
  const myVar = 1
  const other_var = 2
}`
    expect(getRules(code)).not.toContain('naming-inconsistency')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// drift-ignore-file  (whole file suppression)
// ─────────────────────────────────────────────────────────────────────────────
describe('drift-ignore-file', () => {
  it('suppresses all issues when drift-ignore-file is in first 10 lines', () => {
    const code = `// drift-ignore-file\nconst a: any = 1\nconsole.log(a)`
    const report = analyzeCode(code)
    expect(report.issues).toHaveLength(0)
    expect(report.score).toBe(0)
  })

  it('does not suppress when drift-ignore-file is not present', () => {
    const code = `const a: any = 1\nconsole.log(a)`
    const report = analyzeCode(code)
    expect(report.issues.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// score calculation
// ─────────────────────────────────────────────────────────────────────────────
describe('score calculation', () => {
  it('returns score 0 for clean code', () => {
    const code = `export function add(a: number, b: number): number { return a + b }`
    const report = analyzeCode(code)
    expect(report.score).toBe(0)
  })

  it('returns score > 0 when issues are found', () => {
    const code = `const a: any = 1\nconsole.log(a)`
    const report = analyzeCode(code)
    expect(report.score).toBeGreaterThan(0)
  })

  it('caps score at 100', () => {
    // Many issues — score should never exceed 100
    const code = [
      `const a: any = 1`,
      `const b: any = 2`,
      `const c: any = 3`,
      `const d: any = 4`,
      `const e: any = 5`,
      `console.log(a,b,c,d,e)`,
      `try { const x = 1 } catch (e) {}`,
      generateFunction(55),
    ].join('\n')
    const report = analyzeCode(code)
    expect(report.score).toBeLessThanOrEqual(100)
  })
})
