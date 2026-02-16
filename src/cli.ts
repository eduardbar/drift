#!/usr/bin/env node
import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport, formatMarkdown } from './reporter.js'
import { printConsole } from './printer.js'

const program = new Command()

program
  .name('drift')
  .description('Detect silent technical debt left by AI-generated code')
  .version('0.1.0')

program
  .command('scan [path]', { isDefault: true })
  .description('Scan a directory for vibe coding drift')
  .option('-o, --output <file>', 'Write report to a Markdown file')
  .option('--json', 'Output raw JSON report')
  .option('--min-score <n>', 'Exit with code 1 if overall score exceeds this threshold', '0')
  .action((targetPath: string | undefined, options: { output?: string; json?: boolean; minScore: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')

    console.error(`\nScanning ${resolvedPath}...`)

    const files = analyzeProject(resolvedPath)
    const report = buildReport(resolvedPath, files)

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2))
      return
    }

    printConsole(report)

    if (options.output) {
      const md = formatMarkdown(report)
      const outPath = resolve(options.output)
      writeFileSync(outPath, md, 'utf8')
      console.error(`Report saved to ${outPath}`)
    }

    const minScore = Number(options.minScore)
    if (minScore > 0 && report.totalScore > minScore) {
      process.exit(1)
    }
  })

program.parse()
