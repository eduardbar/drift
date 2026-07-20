import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport, formatAIOutput } from './reporter.js'
import { loadConfig } from './config.js'
import { buildContextDocument, writeContextFile } from './context.js'

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
