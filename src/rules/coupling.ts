import { SourceFile } from 'ts-morph'
import type { DriftIssue } from '../types.js'

const COUPLING_THRESHOLD = 10

export function detectHighCoupling(file: SourceFile): DriftIssue[] {
  const imports = file.getImportDeclarations()
  const sources = new Set(imports.map((i) => i.getModuleSpecifierValue()))

  if (sources.size > COUPLING_THRESHOLD) {
    return [
      {
        rule: 'high-coupling',
        severity: 'warning',
        message: `File imports from ${sources.size} distinct modules (threshold: ${COUPLING_THRESHOLD}). High coupling makes refactoring dangerous.`,
        line: 1,
        column: 1,
        snippet: `// ${sources.size} import sources`,
      },
    ]
  }
  return []
}
