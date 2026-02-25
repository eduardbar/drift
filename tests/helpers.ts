import { Project } from 'ts-morph'
import { analyzeFile } from '../src/analyzer.js'
import type { FileReport } from '../src/types.js'

/**
 * Crea un SourceFile temporal en memoria y corre analyzeFile sobre él.
 * El filePath por defecto es 'test.ts' (no en test/spec para que
 * hardcoded-config NO lo skip automáticamente).
 */
export function analyzeCode(code: string, filePath = 'test.ts'): FileReport {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)
  return analyzeFile(sourceFile)
}

/** Extrae solo los nombres de reglas que dispararon */
export function getRules(code: string, filePath = 'test.ts'): string[] {
  return analyzeCode(code, filePath).issues.map(i => i.rule)
}

/** Cuenta cuántas veces disparó una regla específica */
export function countRule(code: string, rule: string, filePath = 'test.ts'): number {
  return analyzeCode(code, filePath).issues.filter(i => i.rule === rule).length
}

/** Genera N líneas de código válido TypeScript (para large-file) */
export function generateLines(n: number): string {
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    lines.push(`const _v${i} = ${i}`)
  }
  return lines.join('\n')
}

/** Genera una función con N líneas de cuerpo (para large-function) */
export function generateFunction(bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `  const _x${i} = ${i}`).join('\n')
  return `function bigFn(): void {\n${body}\n}`
}
