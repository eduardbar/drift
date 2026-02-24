#!/usr/bin/env node
import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport, formatMarkdown, formatAIOutput } from './reporter.js'
import { printConsole, printDiff } from './printer.js'
import { loadConfig } from './config.js'
import { extractFilesAtRef, cleanupTempDir } from './git.js'
import { computeDiff } from './diff.js'
import { generateHtmlReport } from './report.js'
import { generateBadge } from './badge.js'
import { emitCIAnnotations, printCISummary } from './ci.js'

const program = new Command()

program
  .name('drift')
  .description('Detect silent technical debt left by AI-generated code')
  .version('0.6.0')

program
  .command('scan [path]', { isDefault: true })
  .description('Scan a directory for vibe coding drift')
  .option('-o, --output <file>', 'Write report to a Markdown file')
  .option('--json', 'Output raw JSON report')
  .option('--ai', 'Output AI-optimized JSON for LLM consumption')
  .option('--fix', 'Show fix suggestions for each issue')
  .option('--min-score <n>', 'Exit with code 1 if overall score exceeds this threshold', '0')
  .action(async (targetPath: string | undefined, options: { output?: string; json?: boolean; ai?: boolean; fix?: boolean; minScore: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')

    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config)
    process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)
    const report = buildReport(resolvedPath, files)

    if (options.ai) {
      const aiOutput = formatAIOutput(report)
      process.stdout.write(JSON.stringify(aiOutput, null, 2))
      return
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2))
      return
    }

    printConsole(report, { showFix: options.fix })

    if (options.output) {
      const md = formatMarkdown(report)
      const outPath = resolve(options.output)
      writeFileSync(outPath, md, 'utf8')
      // drift-ignore
      console.error(`Report saved to ${outPath}`)
    }

    const minScore = Number(options.minScore)
    if (minScore > 0 && report.totalScore > minScore) {
      process.exit(1)
    }
  })

program
  .command('diff [ref]')
  .description('Compare current state against a git ref (default: HEAD~1)')
  .option('--json', 'Output raw JSON diff')
  .action(async (ref: string | undefined, options: { json?: boolean }) => {
    const baseRef = ref ?? 'HEAD~1'
    const projectPath = resolve('.')

    let tempDir: string | undefined

    try {
      process.stderr.write(`\nComputing diff: HEAD vs ${baseRef}...\n\n`)

      // Scan current state
      const config = await loadConfig(projectPath)
      const currentFiles = analyzeProject(projectPath, config)
      const currentReport = buildReport(projectPath, currentFiles)

      // Extract base state from git
      tempDir = extractFilesAtRef(projectPath, baseRef)
      const baseFiles = analyzeProject(tempDir, config)

      // Remap base file paths to match current project paths
      // (temp dir paths → project paths for accurate comparison)
      const baseReport = buildReport(tempDir, baseFiles)
      const remappedBase = {
        ...baseReport,
        files: baseReport.files.map(f => ({
          ...f,
          path: f.path.replace(tempDir!, projectPath),
        })),
      }

      const diff = computeDiff(remappedBase, currentReport, baseRef)

      if (options.json) {
        process.stdout.write(JSON.stringify(diff, null, 2) + '\n')
      } else {
        printDiff(diff)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    } finally {
      if (tempDir) cleanupTempDir(tempDir)
    }
  })

program
  .command('report [path]')
  .description('Generate a self-contained HTML report')
  .option('-o, --output <file>', 'Output file path (default: drift-report.html)', 'drift-report.html')
  .action(async (targetPath: string | undefined, options: { output: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')
    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config)
    process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)
    const report = buildReport(resolvedPath, files)
    const html = generateHtmlReport(report)
    const outPath = resolve(options.output)
    writeFileSync(outPath, html, 'utf8')
    process.stderr.write(`  Report saved to ${outPath}\n\n`)
  })

program
  .command('badge [path]')
  .description('Generate a badge.svg with the current drift score')
  .option('-o, --output <file>', 'Output file path (default: badge.svg)', 'badge.svg')
  .action(async (targetPath: string | undefined, options: { output: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')
    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config)
    const report = buildReport(resolvedPath, files)
    const svg = generateBadge(report.totalScore)
    const outPath = resolve(options.output)
    writeFileSync(outPath, svg, 'utf8')
    process.stderr.write(`  Badge saved to ${outPath}\n`)
    process.stderr.write(`  Score: ${report.totalScore}/100\n\n`)
  })

program
  .command('ci [path]')
  .description('Emit GitHub Actions annotations and step summary')
  .option('--min-score <n>', 'Exit with code 1 if overall score exceeds this threshold', '0')
  .action(async (targetPath: string | undefined, options: { minScore: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config)
    const report = buildReport(resolvedPath, files)
    emitCIAnnotations(report)
    printCISummary(report)
    const minScore = Number(options.minScore)
    if (minScore > 0 && report.totalScore > minScore) {
      process.exit(1)
    }
  })

program.parse()
