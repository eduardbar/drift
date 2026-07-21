import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport, formatAIOutput } from './reporter.js'
import { loadConfig } from './config.js'
import { buildContextDocument, validateAnalysisTarget, writeContextFile } from './context.js'
import type { ContextDocument, DriftAnalysisOptions } from './types.js'

interface ContextFileSystem {
  statSync?: (path: string) => { isDirectory: () => boolean }
  accessSync?: (path: string, mode: number) => void
  renameSync?: typeof import('node:fs').renameSync
}

interface ContextGenerationDependencies {
  fileSystem?: ContextFileSystem
  loadConfig?: typeof loadConfig
  analyzeProject?: typeof analyzeProject
  buildReport?: typeof buildReport
  formatAIOutput?: typeof formatAIOutput
  writeContextFile?: typeof writeContextFile
}

export async function generateContextFile(
  projectPath: string,
  outputPath: string,
  options: { analysisOptions?: DriftAnalysisOptions; maxIssues?: number } = {},
  dependencies: ContextGenerationDependencies = {},
): Promise<ContextDocument> {
  validateAnalysisTarget(projectPath, dependencies.fileSystem)
  const load = dependencies.loadConfig ?? loadConfig
  const analyze = dependencies.analyzeProject ?? analyzeProject
  const reportBuilder = dependencies.buildReport ?? buildReport
  const aiFormatter = dependencies.formatAIOutput ?? formatAIOutput
  const writer = dependencies.writeContextFile ?? writeContextFile
  const config = await load(projectPath)
  const report = reportBuilder(projectPath, analyze(projectPath, config, options.analysisOptions))
  const doc = buildContextDocument(projectPath, report, aiFormatter(report), {
    config,
    maxIssues: options.maxIssues,
  })

  writer(outputPath, doc, dependencies.fileSystem)
  return doc
}

export async function maybeWriteContext(
  projectRoot: string,
  context: boolean | undefined,
  tasks: string[],
): Promise<void> {
  if (!context) return

  const contextPath = join(projectRoot, '.drift', 'context.md')
  process.stderr.write('  Scanning project to generate context file...\n')
  const config = await loadConfig(projectRoot)
  const report = buildReport(projectRoot, analyzeProject(projectRoot, config))
  const doc = buildContextDocument(projectRoot, report, formatAIOutput(report), {
    config,
    maxIssues: config?.aiIntegration?.maxIssues,
  })

  writeContextFile(contextPath, doc)
  appendGitignoreEntry(projectRoot, '.drift/context.md')
  tasks.push('✅ Generated .drift/context.md')
}

function appendGitignoreEntry(projectRoot: string, entry: string): void {
  const gitignorePath = join(projectRoot, '.gitignore')
  const line = `${entry}\n`
  if (existsSync(gitignorePath)) {
    if (readFileSync(gitignorePath, 'utf8').includes(entry)) return
    appendFileSync(gitignorePath, line, 'utf8')
    return
  }
  writeFileSync(gitignorePath, line, 'utf8')
}
