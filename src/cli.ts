#!/usr/bin/env node
// drift-ignore-file
import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }
import { analyzeProject, analyzeFile, TrendAnalyzer, BlameAnalyzer } from './analyzer.js'
import { buildReport, formatMarkdown, formatAIOutput } from './reporter.js'
import { printConsole, printDiff } from './printer.js'
import { loadConfig } from './config.js'
import { extractFilesAtRef, cleanupTempDir } from './git.js'
import { computeDiff } from './diff.js'
import { generateHtmlReport } from './report.js'
import { generateBadge } from './badge.js'
import { emitCIAnnotations, printCISummary } from './ci.js'
import { applyFixes, type FixResult } from './fix.js'
import { loadHistory, saveSnapshot, printHistory, printSnapshotDiff } from './snapshot.js'
import { generateReview } from './review.js'
import { generateArchitectureMap } from './map.js'

const program = new Command()

program
  .name('drift')
  .description('Detect silent technical debt left by AI-generated code')
  .version(VERSION)

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
  .command('review')
  .description('Review drift against a base ref and output PR markdown')
  .option('--base <ref>', 'Git base ref to compare against', 'origin/main')
  .option('--json', 'Output structured review JSON')
  .option('--comment', 'Output markdown comment body')
  .option('--fail-on <n>', 'Exit with code 1 if score delta is >= n')
  .action(async (options: { base: string; json?: boolean; comment?: boolean; failOn?: string }) => {
    try {
      const review = await generateReview(resolve('.'), options.base)

      if (options.json) {
        process.stdout.write(JSON.stringify(review, null, 2) + '\n')
      } else {
        process.stdout.write((options.comment ? review.markdown : `${review.summary}\n\n${review.markdown}`) + '\n')
      }

      const failOn = options.failOn ? Number(options.failOn) : undefined
      if (typeof failOn === 'number' && !Number.isNaN(failOn) && review.totalDelta >= failOn) {
        process.exit(1)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    }
  })

program
  .command('map [path]')
  .description('Generate architecture.svg with simple layer dependencies')
  .option('-o, --output <file>', 'Output SVG path (default: architecture.svg)', 'architecture.svg')
  .action(async (targetPath: string | undefined, options: { output: string }) => {
    const resolvedPath = resolve(targetPath ?? '.')
    process.stderr.write(`\nBuilding architecture map for ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const out = generateArchitectureMap(resolvedPath, options.output, config)
    process.stderr.write(`  Architecture map saved to ${out}\n\n`)
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

program
  .command('trend [period]')
  .description('Analyze trend of technical debt over time')
  .option('--since <date>', 'Start date for trend analysis (ISO format)')
  .option('--until <date>', 'End date for trend analysis (ISO format)')
  .action(async (period: string | undefined, options: { since?: string; until?: string }) => {
    const resolvedPath = resolve('.')
    process.stderr.write(`\nAnalyzing trend in ${resolvedPath}...\n`)
    
    const config = await loadConfig(resolvedPath)
    const analyzer = new TrendAnalyzer(resolvedPath, analyzeProject, config)
    
    const trendData = await analyzer.analyzeTrend({
      period: period as 'week' | 'month' | 'quarter' | 'year',
      since: options.since,
      until: options.until
    })
    
    process.stderr.write(`\nTrend analysis complete:\n`)
    process.stdout.write(JSON.stringify(trendData, null, 2) + '\n')
  })

program
  .command('blame [target]')
  .description('Analyze which files/rules contribute most to technical debt')
  .option('--top <n>', 'Number of top contributors to show (default: 10)', '10')
  .action(async (target: string | undefined, options: { top: string }) => {
    const resolvedPath = resolve('.')
    process.stderr.write(`\nAnalyzing blame in ${resolvedPath}...\n`)
    
    const config = await loadConfig(resolvedPath)
    const analyzer = new BlameAnalyzer(resolvedPath, analyzeProject, analyzeFile, config)
    
    const blameData = await analyzer.analyzeBlame({
      target: target as 'file' | 'rule' | 'overall' | undefined,
      top: Number(options.top)
    })
    
    process.stderr.write(`\nBlame analysis complete:\n`)
    process.stdout.write(JSON.stringify(blameData, null, 2) + '\n')
  })

program
  .command('fix [path]')
  .description('Auto-fix safe issues (debug-leftover console.*, catch-swallow)')
  .option('--rule <rule>', 'Fix only a specific rule')
  .option('--preview', 'Preview changes without writing files')
  .option('--write', 'Write fixes to disk')
  .option('--dry-run', 'Show what would change without writing files')
  .option('-y, --yes', 'Skip interactive confirmation for --write')
  .action(async (targetPath: string | undefined, options: { rule?: string; dryRun?: boolean; preview?: boolean; write?: boolean; yes?: boolean }) => {
    const resolvedPath = resolve(targetPath ?? '.')
    const config = await loadConfig(resolvedPath)
    const previewMode = Boolean(options.preview || options.dryRun)
    const writeMode = options.write ?? !previewMode

    if (writeMode && !options.yes) {
      const previewResults = await applyFixes(resolvedPath, config, {
        rule: options.rule,
        dryRun: true,
        preview: true,
        write: false,
      })

      if (previewResults.length === 0) {
        console.log('No fixable issues found.')
        return
      }

      const files = new Set(previewResults.map((result) => result.file)).size
      const prompt = `Apply ${previewResults.length} fix(es) across ${files} file(s)? [y/N] `
      const rl = createInterface({ input, output })
      const answer = (await rl.question(prompt)).trim().toLowerCase()
      rl.close()

      if (answer !== 'y' && answer !== 'yes') {
        console.log('Aborted. No files were modified.')
        return
      }
    }

    const results = await applyFixes(resolvedPath, config, {
      rule: options.rule,
      dryRun: previewMode,
      preview: previewMode,
      write: writeMode,
    })

    if (results.length === 0) {
      console.log('No fixable issues found.')
      return
    }

    const applied = results.filter(r => r.applied)

    if (previewMode) {
      console.log(`\ndrift fix --preview: ${results.length} fixable issues found\n`)
    } else {
      console.log(`\ndrift fix: ${applied.length} fixes applied\n`)
    }

    // Group by file for clean output
    const byFile = new Map<string, FixResult[]>()
    for (const r of results) {
      if (!byFile.has(r.file)) byFile.set(r.file, [])
      byFile.get(r.file)!.push(r)
    }

    for (const [file, fileResults] of byFile) {
      const relPath = file.replace(resolvedPath + '/', '').replace(resolvedPath + '\\', '')
      console.log(`  ${relPath}`)
      for (const r of fileResults) {
        const status = r.applied ? (previewMode ? 'would fix' : 'fixed') : 'skipped'
        console.log(`    [${r.rule}] line ${r.line}: ${r.description} — ${status}`)
        if (r.before || r.after) {
          console.log(`      before: ${r.before ?? '(empty)'}`)
          console.log(`      after : ${r.after ?? '(empty)'}`)
        }
      }
    }

    if (!previewMode && applied.length > 0) {
      console.log(`\n${applied.length} issue(s) fixed. Re-run drift scan to verify.`)
    }
  })

program
  .command('snapshot [path]')
  .description('Record a score snapshot to drift-history.json')
  .option('-l, --label <label>', 'label for this snapshot (e.g. sprint name, version)')
  .option('--history', 'show all recorded snapshots')
  .option('--diff', 'compare current score vs last snapshot')
  .action(async (
    targetPath: string | undefined,
    opts: { label?: string; history?: boolean; diff?: boolean },
  ) => {
    const resolvedPath = resolve(targetPath ?? '.')

    if (opts.history) {
      const history = loadHistory(resolvedPath)
      printHistory(history)
      return
    }

    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config)
    process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)
    const report = buildReport(resolvedPath, files)

    if (opts.diff) {
      const history = loadHistory(resolvedPath)
      printSnapshotDiff(history, report.totalScore)
      return
    }

    const entry = saveSnapshot(resolvedPath, report, opts.label)
    const labelStr = entry.label ? ` [${entry.label}]` : ''
    process.stdout.write(
      `  Snapshot recorded${labelStr}: score ${entry.score} (${entry.grade}) — ${entry.totalIssues} issues across ${entry.files} files\n`,
    )
    process.stdout.write(`  Saved to drift-history.json\n\n`)
  })

program.parse()
