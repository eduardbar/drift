// drift-ignore-file

import { Project } from 'ts-morph'
import type { FileReport } from '@eduardbar/drift'

// Import dinámico para compatibilidad CommonJS -> ESM
// @eduardbar/drift es "type": "module" pero desde CommonJS
// se debe usar import() dinámico.
// _analyzeFile se tipea como `Function` para evitar el conflicto de
// instancias duplicadas de ts-morph (una en este paquete, otra en
// @eduardbar/drift/node_modules). En runtime son compatibles.
// eslint-disable-next-line @typescript-eslint/ban-types
let _analyzeFile: Function | null = null

async function getAnalyzeFile(): Promise<Function> {
  if (!_analyzeFile) {
    // drift es ES module, desde CommonJS usamos import() dinámico
    const drift = await import('@eduardbar/drift')
    _analyzeFile = drift.analyzeFile
  }
  return _analyzeFile!
}

export async function analyzeFilePath(filePath: string): Promise<FileReport | null> {
  try {
    const analyzeFile = await getAnalyzeFile()
    const project = new Project({
      compilerOptions: {
        allowJs: true,
        jsx: 1, // JsxEmit.Preserve
      },
      skipAddingFilesFromTsConfig: true,
    })
    const sourceFile = project.addSourceFileAtPath(filePath)
    return analyzeFile(sourceFile) as FileReport
  } catch (err) {
    console.error('[drift] analyzeFilePath error:', err)
    return null
  }
}
