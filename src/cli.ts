#!/usr/bin/env node
// drift-ignore-file
import { Command } from 'commander'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
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
import { formatGuardJson, runGuard } from './guard.js'
import { generateHtmlReport } from './report.js'
import { generateBadge } from './badge.js'
import { emitCIAnnotations, printCISummary } from './ci.js'
import { applyFixes, type FixResult } from './fix.js'
import { loadHistory, saveSnapshot, printHistory, printSnapshotDiff } from './snapshot.js'
import { generateReview } from './review.js'
import { generateArchitectureMap } from './map.js'
import {
  changeOrganizationPlan,
  generateSaasDashboardHtml,
  getOrganizationEffectiveLimits,
  getOrganizationUsageSnapshot,
  getSaasSummary,
  ingestSnapshotFromReport,
  listOrganizationPlanChanges,
} from './saas.js'
import {
  buildTrustReport,
  explainTrustGatePolicy,
  formatTrustGatePolicyExplanation,
  formatTrustJson,
  renderTrustOutput,
  shouldFailTrustGate,
  normalizeMergeRiskLevel,
  MERGE_RISK_ORDER,
  detectBranchName,
} from './trust.js'
import { computeTrustKpis, formatTrustKpiConsole, formatTrustKpiJson } from './trust-kpi.js'
import { runBenchmarkCli } from './benchmark.js'
import { runInit, INIT_PRESETS } from './init.js'
import { generateContextFile } from './context-init.js'
import { runDoctor } from './doctor.js'
import {
  buildContextDocument,
  checkContextFreshness,
  formatContextMarkdown,
  runWatch,
  writeContextFile,
  validateAnalysisTarget,
} from './context.js'
import { inspectMCPTools, runMcpServer } from './mcp-server.js'
import { resolveOutputFormat } from './format.js'
import { toSarif, diffToSarif } from './sarif.js'
import { runAIGuard, selectDiffSource } from './ai-guard.js'
import { formatAIGuardHuman, formatAIGuardJson } from './ai-guard-results.js'
import type { DriftDiff, DriftTrustReport, DriftAnalysisOptions, MergeRiskLevel } from './types.js'
import type { GuardResult, GuardThresholds } from './guard-types.js'
import type { TrustGatePolicyExplanation } from './trust.js'
import type { SnapshotHistory } from './snapshot.js'
const program = new Command()

type ResourceOptionFlags = {
  lowMemory?: boolean
  chunkSize?: string
  maxFiles?: string
  maxFileSizeKb?: string
  withSemanticDuplication?: boolean
}

function parseOptionalPositiveInt(rawValue: string | undefined, flagName: string): number | undefined {
  if (rawValue == null) return undefined
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flagName} must be a non-negative integer`)
  }
  return value
}

function resolveAnalysisOptions(options: ResourceOptionFlags): DriftAnalysisOptions {
  return {
    lowMemory: options.lowMemory,
    chunkSize: parseOptionalPositiveInt(options.chunkSize, '--chunk-size'),
    maxFiles: parseOptionalPositiveInt(options.maxFiles, '--max-files'),
    maxFileSizeKb: parseOptionalPositiveInt(options.maxFileSizeKb, '--max-file-size-kb'),
    includeSemanticDuplication: options.withSemanticDuplication ? true : undefined,
  }
}

function addResourceOptions(command: Command): Command {
  return command
    .option('--low-memory', 'Reduce peak memory usage by chunking AST analysis')
    .option('--chunk-size <n>', 'Files per chunk in low-memory mode (default: 40)')
    .option('--max-files <n>', 'Maximum files to analyze before soft-skipping extras')
    .option('--max-file-size-kb <n>', 'Skip files above this size and report diagnostics')
    .option('--with-semantic-duplication', 'Keep semantic-duplication rule enabled in low-memory mode')
}

function parseOptionalNumber(rawValue: string | undefined, flagName: string): number | undefined {
  if (rawValue == null) return undefined
  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    throw new Error(`${flagName} must be a valid number`)
  }
  return value
}

function parseBySeverity(rawValue: string | undefined): GuardThresholds | undefined {
  if (rawValue == null) return undefined

  const spec = rawValue.trim()
  if (!spec) {
    throw new Error('--by-severity must not be empty. Expected format: error=0,warning=2,info=5')
  }

  const thresholds: GuardThresholds = {}
  const seen = new Set<string>()

  for (const segment of spec.split(',')) {
    const pair = segment.trim()
    if (!pair) continue

    const equalIndex = pair.indexOf('=')
    if (equalIndex <= 0 || equalIndex === pair.length - 1) {
      throw new Error(`Invalid --by-severity entry '${pair}'. Expected key=value (e.g. warning=2).`)
    }

    const key = pair.slice(0, equalIndex).trim().toLowerCase()
    const rawThreshold = pair.slice(equalIndex + 1).trim()

    if (key !== 'error' && key !== 'warning' && key !== 'info') {
      throw new Error(`Invalid --by-severity key '${key}'. Allowed keys: error, warning, info.`)
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate --by-severity key '${key}'.`)
    }

    const threshold = Number(rawThreshold)
    if (!Number.isFinite(threshold)) {
      throw new Error(`Invalid --by-severity value for '${key}': '${rawThreshold}'. Must be a valid number.`)
    }

    const severityKey: keyof GuardThresholds = key
    thresholds[severityKey] = threshold
    seen.add(severityKey)
  }

  if (seen.size === 0) {
    throw new Error('--by-severity must include at least one threshold. Example: error=0,warning=2')
  }

  return thresholds
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

function printGuardSummary(result: GuardResult): void {
  const modeLabel = result.mode === 'diff' ? `diff (${result.baseRef ?? 'unknown base'})` : 'baseline'
  const statusLabel = result.passed ? 'PASS' : 'FAIL'

  process.stdout.write('\n')
  process.stdout.write(`Guard mode: ${modeLabel}\n`)
  process.stdout.write(`Result: ${statusLabel}\n`)
  process.stdout.write(`Score delta: ${formatSigned(result.metrics.scoreDelta)}\n`)
  process.stdout.write(`Total issues delta: ${formatSigned(result.metrics.totalIssuesDelta)}\n`)
  process.stdout.write(
    `Severity delta: error=${formatSigned(result.metrics.severityDelta.error)}, warning=${formatSigned(result.metrics.severityDelta.warning)}, info=${formatSigned(result.metrics.severityDelta.info)}\n`,
  )
  if (result.mode === 'baseline' && result.baselinePath) {
    process.stdout.write(`Baseline file: ${result.baselinePath}\n`)
  }

  if (result.checks.length === 0) {
    process.stdout.write('Checks: none configured\n')
    return
  }

  process.stdout.write('Checks:\n')
  for (const check of result.checks) {
    process.stdout.write(
      `  - [${check.passed ? 'PASS' : 'FAIL'}] ${check.id}: ${check.message} (actual=${check.actual}, limit=${check.limit})\n`,
    )
  }
}

function parseTrustGateOverrides(options: { minTrust?: string; maxRisk?: string }): { minTrust?: number; maxRisk?: MergeRiskLevel } {
  const cliMinTrust = options.minTrust ? Number(options.minTrust) : undefined
  if (options.minTrust && Number.isNaN(cliMinTrust)) {
    process.stderr.write('\n  Error: --min-trust must be a valid number\n\n')
    process.exit(1)
  }

  let cliMaxRisk: MergeRiskLevel | undefined
  if (options.maxRisk) {
    cliMaxRisk = normalizeMergeRiskLevel(options.maxRisk)
    if (!cliMaxRisk) {
      process.stderr.write(`\n  Error: --max-risk must be one of ${MERGE_RISK_ORDER.join(', ')}\n\n`)
      process.exit(1)
    }
  }

  return {
    minTrust: typeof cliMinTrust === 'number' ? cliMinTrust : undefined,
    maxRisk: cliMaxRisk,
  }
}

function resolveBranchFromOption(branch?: string): string | undefined {
  const normalized = branch?.trim()
  if (normalized) return normalized
  return detectBranchName()
}

function printTrustGatePolicyDebug(explanation: TrustGatePolicyExplanation): void {
  process.stderr.write(`${formatTrustGatePolicyExplanation(explanation)}\n`)
  if (explanation.invalidPolicyPack) {
    process.stderr.write(`Warning: policy pack '${explanation.invalidPolicyPack}' was not found. Falling back to base/preset policy.\n`)
  }
}

function printSaasErrorAndExit(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`\n  Error: ${message}\n\n`)
  process.exit(1)
}

program
  .name('drift')
  .description('AI Code Audit CLI for merge trust in AI-assisted PRs')
  .version(VERSION)

addResourceOptions(
  program
    .command('scan [path]', { isDefault: true })
  .description('Scan a directory for vibe coding drift')
  .option('-o, --output <file>', 'Write report to a Markdown file')
  .option('--format <type>', 'Output format: console|json|markdown|ai|sarif')
  .option('--json', 'Output raw JSON report')
  .option('--ai', 'Output AI-optimized JSON for LLM consumption')
  .option('--fix', 'Show fix suggestions for each issue')
  .option('--min-score <n>', 'Exit with code 1 if overall score exceeds this threshold', '0')
  .action(async (targetPath: string | undefined, options: { output?: string; format?: string; json?: boolean; ai?: boolean; fix?: boolean; minScore: string } & ResourceOptionFlags) => {
    const resolvedPath = resolve(targetPath ?? '.')

    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
    process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)
    const report = buildReport(resolvedPath, files)

    const format = resolveOutputFormat({
      command: 'scan',
      format: options.format,
      supported: ['console', 'json', 'markdown', 'ai', 'sarif'],
      legacyAliases: [
        { flag: 'json', used: options.json, mapsTo: 'json' },
        { flag: 'ai', used: options.ai, mapsTo: 'ai' },
      ],
      onWarning: (message) => process.stderr.write(`${message}\n`),
    })

    if (format === 'sarif') {
      process.stdout.write(`${JSON.stringify(toSarif(report), null, 2)}\n`)
      return
    }

    if (format === 'ai') {
      const aiOutput = formatAIOutput(report)
      process.stdout.write(JSON.stringify(aiOutput, null, 2))
      return
    }

    if (format === 'json') {
      process.stdout.write(JSON.stringify(report, null, 2))
      return
    }

    if (format === 'markdown') {
      process.stdout.write(`${formatMarkdown(report)}\n`)
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
  }),
)

program
  .command('init')
  .description('Initialize drift configuration with presets and scaffolding')
  .option('--preset <type>', `Scaffold config with preset: ${INIT_PRESETS.join(', ')}`)
  .option('--ci', 'Generate GitHub Actions workflow for drift review')
  .option('--baseline', 'Create drift-baseline.json with current project score')
  .option('--context', 'Generate .drift/context.md and add it to .gitignore')
  .action(async (options: { preset?: string; ci?: boolean; baseline?: boolean; context?: boolean }) => {
    const projectRoot = resolve('.')

    try {
      await runInit(projectRoot, {
        preset: options.preset,
        ci: options.ci,
        baseline: options.baseline,
        context: options.context,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    }
  })

addResourceOptions(
  program
    .command('context [path]')
    .description('Generate a Markdown context file for AI coding assistants')
    .option('-o, --output <file>', 'Output file path (default: .drift/context.md)')
    .option('--format <type>', 'Output format: markdown|json')
    .option('--max-issues <n>', 'Maximum violations to include (default: 20)', '20')
    .option('--ci', 'Exit 1 if the context file is stale')
    .option('--watch', 'Regenerate context file when source files change')
    .action(async (
      targetPath: string | undefined,
      options: {
        output?: string
        format?: string
        maxIssues: string
        ci?: boolean
        watch?: boolean
      } & ResourceOptionFlags,
    ) => {
      const resolvedPath = resolve(targetPath ?? '.')
      const outputPath = resolve(options.output ?? join(resolvedPath, '.drift', 'context.md'))
      const maxIssues = Number(options.maxIssues)
      const isJson = options.format === 'json'

      try {
        validateAnalysisTarget(resolvedPath)
        const config = await loadConfig(resolvedPath)
        const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
        const report = buildReport(resolvedPath, files)

        if (options.ci) {
          const freshness = checkContextFreshness(outputPath, report.totalScore)
          if (freshness.missing) {
            process.stderr.write(`\n  Error: context file is missing: ${outputPath}\n\n`)
            process.exit(1)
          }
          if (!freshness.fresh) {
            process.stderr.write(
              `\n  Warning: context file is stale (recorded score ${freshness.recordedScore}, current ${report.totalScore}, delta ${freshness.delta}). Run 'drift context' to regenerate.\n\n`,
            )
            process.exit(1)
          }
          process.stderr.write('\n  Context file is fresh.\n\n')
          return
        }

        const aiOutput = formatAIOutput(report)
        const contextOptions = {
          config,
          maxIssues: Number.isNaN(maxIssues) ? undefined : maxIssues,
        }
        const doc = buildContextDocument(resolvedPath, report, aiOutput, contextOptions)

        if (isJson) {
          process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
          return
        }

        if (options.watch) {
          const generate = async (): Promise<void> => {
            await generateContextFile(resolvedPath, outputPath, {
              analysisOptions: resolveAnalysisOptions(options),
              maxIssues: contextOptions.maxIssues,
            })
          }

          await generate()
          const watcher = runWatch(resolvedPath, generate, 300, outputPath)

          process.stderr.write(`\nWatching ${resolvedPath} for changes. Press Ctrl+C to stop.\n`)

          process.on('SIGINT', () => {
            watcher.close()
            process.exit(0)
          })
          process.on('SIGTERM', () => {
            watcher.close()
            process.exit(0)
          })
          return
        }

        writeContextFile(outputPath, doc)
        process.stderr.write(`\n  Context file written to ${outputPath}\n\n`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\n  Error: ${message}\n\n`)
        process.exit(1)
      }
    }),
)

addResourceOptions(
  program
    .command('mcp [path]')
    .description('Start a stdio MCP server exposing drift analysis tools')
    .option('--inspect', 'Print the tool definitions as JSON and exit')
    .action(async (
      targetPath: string | undefined,
      options: { inspect?: boolean } & ResourceOptionFlags,
    ) => {
      const resolvedPath = resolve(targetPath ?? '.')

      if (options.inspect) {
        process.stdout.write(`${JSON.stringify({ tools: inspectMCPTools() }, null, 2)}\n`)
        return
      }

      try {
        await runMcpServer({
          projectPath: resolvedPath,
          analysisOptions: resolveAnalysisOptions(options),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\n  Error: ${message}\n\n`)
        process.exit(1)
      }
    }),
)

addResourceOptions(
  program
    .command('ai-guard [path]')
    .description('Audit a proposed diff in an isolated before/after workspace')
    .option('--stdin', 'Read the unified diff from stdin')
    .option('--staged', 'Read the staged git diff')
    .option('--diff-file <file>', 'Read the unified diff from a file')
    .option('--base <ref>', 'Read the diff from a git ref')
    .option('--budget <n>', 'Maximum allowed score delta (default: 0)')
    .option('--block-on <rules>', 'Comma-separated rules or severities that block the merge')
    .option('--format <type>', 'Output format: human|json', 'human')
    .option('--suggestions', 'Include remediation suggestions in output')
    .action(async (
      targetPath: string | undefined,
      options: {
        stdin?: boolean
        staged?: boolean
        diffFile?: string
        base?: string
        budget?: string
        blockOn?: string
        format?: string
        suggestions?: boolean
      } & ResourceOptionFlags,
    ) => {
      const projectPath = resolve(targetPath ?? '.')
      try {
        if (options.format !== 'human' && options.format !== 'json') throw new Error(`Invalid --format '${options.format}'. Expected human or json`)
        const source = selectDiffSource({ stdin: options.stdin, staged: options.staged, file: options.diffFile, base: options.base }, options.stdin ? readFileSync(0, 'utf8') : '')
        const budget = options.budget == null ? undefined : Number(options.budget)
        if (budget != null && (!Number.isFinite(budget))) throw new Error('--budget must be a valid number')
        const blockOn = options.blockOn?.split(',').map(value => value.trim()).filter(Boolean)
        const config = await loadConfig(projectPath)
        const result = await runAIGuard({ projectPath, source, budget: budget ?? config?.aiGuard?.budget, blockOn: blockOn ?? config?.aiGuard?.blockOn, suggestions: options.suggestions, analysisOptions: resolveAnalysisOptions(options), config })
        process.stdout.write(`${options.format === 'json' ? formatAIGuardJson(result) : formatAIGuardHuman(result)}\n`)
        if (!result.passed) process.exitCode = 1
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\n  Error: ${message}\n\n`)
        process.exitCode = 2
      }
    }),
)

addResourceOptions(
  program
    .command('diff [ref]')
  .description('Compare current state against a git ref (default: HEAD~1)')
  .option('--format <type>', 'Output format: console|json|markdown|ai|sarif')
  .option('--json', 'Output raw JSON diff')
  .action(async (ref: string | undefined, options: { format?: string; json?: boolean } & ResourceOptionFlags) => {
    const baseRef = ref ?? 'HEAD~1'
    const projectPath = resolve('.')
    const analysisOptions = resolveAnalysisOptions(options)

    let tempDir: string | undefined

    try {
      process.stderr.write(`\nComputing diff: HEAD vs ${baseRef}...\n\n`)

      const format = resolveOutputFormat({
        command: 'diff',
        format: options.format,
        supported: ['console', 'json', 'sarif'],
        legacyAliases: [{ flag: 'json', used: options.json, mapsTo: 'json' }],
        onWarning: (message) => process.stderr.write(`${message}\n`),
      })

      // Scan current state
      const config = await loadConfig(projectPath)
      const currentFiles = analyzeProject(projectPath, config, analysisOptions)
      const currentReport = buildReport(projectPath, currentFiles)

      // Extract base state from git
      tempDir = extractFilesAtRef(projectPath, baseRef)
      const baseFiles = analyzeProject(tempDir, config, analysisOptions)

      // Remap base file paths to match current project paths
      // (temp dir paths → project paths for accurate comparison)
      const baseReport = buildReport(tempDir, baseFiles)
      const remappedBase = {
        ...baseReport,
        files: baseReport.files.map(f => ({
          ...f,
          path: resolve(projectPath, relative(tempDir!, f.path)),
        })),
      }

      const diff = computeDiff(remappedBase, currentReport, baseRef)

      if (format === 'sarif') {
        process.stdout.write(`${JSON.stringify(diffToSarif(diff), null, 2)}\n`)
      } else if (format === 'json') {
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
  }),
)

addResourceOptions(
  program
    .command('guard [path]')
  .description('Evaluate drift guard thresholds against diff or baseline')
  .option('--base <ref>', 'Git base ref for diff guard mode')
  .option('--baseline <file>', 'Baseline file path (default: drift-baseline.json)')
  .option('--budget <n>', 'Allowed score delta budget')
  .option('--by-severity <spec>', 'Severity thresholds: error=0,warning=2,info=5')
  .option('--json', 'Output raw JSON guard result')
  .action(async (
    targetPath: string | undefined,
    options: {
      base?: string
      baseline?: string
      budget?: string
      bySeverity?: string
      json?: boolean
    } & ResourceOptionFlags,
  ) => {
    try {
      const resolvedPath = resolve(targetPath ?? '.')
      const budget = parseOptionalNumber(options.budget, '--budget')
      const bySeverity = parseBySeverity(options.bySeverity)

      const result = await runGuard(resolvedPath, {
        baseRef: options.base,
        baselinePath: options.baseline,
        budget,
        bySeverity,
        analysis: resolveAnalysisOptions(options),
      })

      if (options.json) {
        process.stdout.write(`${formatGuardJson(result)}\n`)
      } else {
        printGuardSummary(result)
      }

      if (!result.passed) {
        process.exit(1)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    }
  }),
)

program
  .command('benchmark')
  .description('Run benchmark harness for scan/review/trust commands')
  .allowUnknownOption(true)
  .action(async () => {
    await runBenchmarkCli(process.argv.slice(3))
  })

program
  .command('review')
  .description('Review drift against a base ref and output PR markdown')
  .option('--base <ref>', 'Git base ref to compare against', 'origin/main')
  .option('--format <type>', 'Output format: console|json|markdown|ai|sarif')
  .option('--json', 'Output structured review JSON')
  .option('--comment', 'Output markdown comment body')
  .option('--fail-on <n>', 'Exit with code 1 if score delta is >= n')
  .action(async (options: { base: string; format?: string; json?: boolean; comment?: boolean; failOn?: string }) => {
    try {
      const review = await generateReview(resolve('.'), options.base)
      const format = resolveOutputFormat({
        command: 'review',
        format: options.format,
        supported: ['console', 'json', 'markdown', 'sarif'],
        legacyAliases: [
          { flag: 'json', used: options.json, mapsTo: 'json' },
          { flag: 'comment', used: options.comment, mapsTo: 'markdown' },
        ],
        onWarning: (message) => process.stderr.write(`${message}\n`),
      })

      if (format === 'sarif') {
        process.stdout.write(`${JSON.stringify(diffToSarif(review.diff), null, 2)}\n`)
      } else if (format === 'json') {
        process.stdout.write(JSON.stringify(review, null, 2) + '\n')
      } else if (format === 'markdown') {
        process.stdout.write(`${review.markdown}\n`)
      } else {
        process.stdout.write(`${review.summary}\n\n${review.markdown}\n`)
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

addResourceOptions(
  program
    .command('trust [path]')
  .description('Compute merge trust baseline from drift signals')
  .option('--base <ref>', 'Git base ref for diff-aware trust scoring')
  .option('--format <type>', 'Output format: console|json|markdown|ai|sarif')
  .option('--json', 'Output structured trust JSON')
  .option('--markdown', 'Output trust report as markdown (PR comment ready)')
  .option('-o, --output <file>', 'Write trust output to file')
  .option('--json-output <file>', 'Write structured trust JSON to file without changing stdout format')
  .option('--min-trust <n>', 'Exit with code 1 if trust score is below threshold')
  .option('--max-risk <level>', 'Exit with code 1 if merge risk exceeds level (LOW|MEDIUM|HIGH|CRITICAL)')
  .option('--branch <name>', 'Branch name for trust policy matching (default: auto-detect from CI env)')
  .option('--policy-pack <name>', 'Trust policy pack from drift.config trustGate.policyPacks')
  .option('--explain-policy', 'Print effective trust gate policy resolution to stderr')
  .option('--advanced-trust', 'Enable advanced trust mode with historical comparison and team guidance')
  .option('--previous-trust <file>', 'Previous trust JSON file to compare against (used in advanced mode)')
  .option('--history-file <file>', 'Snapshot history JSON file (default: <path>/drift-history.json) for advanced mode')
  .action(async (
    targetPath: string | undefined,
    options: {
      base?: string
      format?: string
      json?: boolean
      markdown?: boolean
      output?: string
      jsonOutput?: string
      minTrust?: string
      maxRisk?: string
      branch?: string
      policyPack?: string
      explainPolicy?: boolean
      advancedTrust?: boolean
      previousTrust?: string
      historyFile?: string
    } & ResourceOptionFlags,
  ) => {
    let tempDir: string | undefined

    try {
      const resolvedPath = resolve(targetPath ?? '.')
      const analysisOptions = resolveAnalysisOptions(options)

      process.stderr.write(`\nScanning ${resolvedPath} for trust signals...\n`)
      const config = await loadConfig(resolvedPath)
      const files = analyzeProject(resolvedPath, config, analysisOptions)
      process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)

      const report = buildReport(resolvedPath, files)
      const branchName = resolveBranchFromOption(options.branch)
      const policyExplanation = explainTrustGatePolicy(config, {
        branchName,
        policyPack: options.policyPack,
        overrides: parseTrustGateOverrides(options),
      })
      const policy = policyExplanation.effectivePolicy

      if (options.explainPolicy) {
        printTrustGatePolicyDebug(policyExplanation)
      } else if (policyExplanation.invalidPolicyPack) {
        process.stderr.write(`Warning: policy pack '${policyExplanation.invalidPolicyPack}' was not found. Falling back to base/preset policy.\n`)
      }

      let diff: DriftDiff | undefined
      if (options.base) {
        process.stderr.write(`Computing diff signals against ${options.base}...\n`)
        tempDir = extractFilesAtRef(resolvedPath, options.base)
        const baseFiles = analyzeProject(tempDir, config, analysisOptions)
        const baseReport = buildReport(tempDir, baseFiles)
        const remappedBase = {
          ...baseReport,
          files: baseReport.files.map((file) => ({
            ...file,
            path: resolve(resolvedPath, relative(tempDir!, file.path)),
          })),
        }
        diff = computeDiff(remappedBase, report, options.base)
        process.stderr.write(`  Diff: ${diff.totalDelta >= 0 ? '+' : ''}${diff.totalDelta} score, +${diff.newIssuesCount} new / -${diff.resolvedIssuesCount} resolved\n\n`)
      }

      let previousTrustReport: Partial<DriftTrustReport> | undefined
      let snapshots: SnapshotHistory['snapshots'] | undefined
      if (options.advancedTrust) {
        if (options.previousTrust) {
          const previousTrustPath = resolve(options.previousTrust)
          const rawPreviousTrust = readFileSync(previousTrustPath, 'utf8')
          previousTrustReport = JSON.parse(rawPreviousTrust) as Partial<DriftTrustReport>
          process.stderr.write(`Advanced trust: loaded previous trust JSON from ${previousTrustPath}\n`)
        }

        if (options.historyFile) {
          const historyPath = resolve(options.historyFile)
          const rawHistory = readFileSync(historyPath, 'utf8')
          const history = JSON.parse(rawHistory) as SnapshotHistory
          snapshots = history.snapshots
          process.stderr.write(`Advanced trust: loaded snapshot history from ${historyPath}\n`)
        } else {
          snapshots = loadHistory(resolvedPath).snapshots
        }
      }

      const trust = buildTrustReport(report, {
        diff,
        advanced: {
          enabled: options.advancedTrust,
          previousTrust: previousTrustReport,
          snapshots,
        },
      })

      const format = resolveOutputFormat({
        command: 'trust',
        format: options.format,
        supported: ['console', 'json', 'markdown', 'sarif'],
        legacyAliases: [
          { flag: 'json', used: options.json, mapsTo: 'json' },
          { flag: 'markdown', used: options.markdown, mapsTo: 'markdown' },
        ],
        onWarning: (message) => process.stderr.write(`${message}\n`),
      })

      const rendered = format === 'sarif'
        ? `${JSON.stringify(toSarif(report), null, 2)}\n`
        : `${renderTrustOutput(trust, {
          json: format === 'json',
          markdown: format === 'markdown',
        })}\n`

      process.stdout.write(rendered)

      if (options.output) {
        const outPath = resolve(options.output)
        writeFileSync(outPath, rendered, 'utf8')
        process.stderr.write(`Trust output saved to ${outPath}\n`)
      }

      if (options.jsonOutput) {
        const jsonOutPath = resolve(options.jsonOutput)
        writeFileSync(jsonOutPath, `${formatTrustJson(trust)}\n`, 'utf8')
        process.stderr.write(`Trust JSON saved to ${jsonOutPath}\n`)
      }

      if (policy.enabled === false) {
        process.stderr.write(`Trust gate skipped by policy${branchName ? ` (branch: ${branchName})` : ''}\n`)
        return
      }

      if (shouldFailTrustGate(trust, policy)) {
        process.exit(1)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    } finally {
      if (tempDir) cleanupTempDir(tempDir)
    }
  }),
)

program
  .command('trust-gate <trustJsonFile>')
  .description('Evaluate trust gate thresholds from an existing trust JSON file')
  .option('--min-trust <n>', 'Fail if trust score is below threshold')
  .option('--max-risk <level>', 'Fail if merge risk exceeds level (LOW|MEDIUM|HIGH|CRITICAL)')
  .option('--branch <name>', 'Branch name for trust policy matching (default: auto-detect from CI env)')
  .option('--policy-pack <name>', 'Trust policy pack from drift.config trustGate.policyPacks')
  .option('--explain-policy', 'Print effective trust gate policy resolution to stderr')
  .action(async (trustJsonFile: string, options: { minTrust?: string; maxRisk?: string; branch?: string; policyPack?: string; explainPolicy?: boolean }) => {
    try {
      const filePath = resolve(trustJsonFile)
      const raw = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<DriftTrustReport>
      const config = await loadConfig(resolve('.'))
      const branchName = resolveBranchFromOption(options.branch)
      const policyExplanation = explainTrustGatePolicy(config, {
        branchName,
        policyPack: options.policyPack,
        overrides: parseTrustGateOverrides(options),
      })
      const policy = policyExplanation.effectivePolicy

      if (options.explainPolicy) {
        printTrustGatePolicyDebug(policyExplanation)
      } else if (policyExplanation.invalidPolicyPack) {
        process.stderr.write(`Warning: policy pack '${policyExplanation.invalidPolicyPack}' was not found. Falling back to base/preset policy.\n`)
      }

      if (typeof parsed.trust_score !== 'number') {
        process.stderr.write('\n  Error: trust JSON is missing numeric trust_score\n\n')
        process.exit(1)
      }

      if (typeof parsed.merge_risk !== 'string') {
        process.stderr.write('\n  Error: trust JSON is missing merge_risk\n\n')
        process.exit(1)
      }

      const actualRisk = normalizeMergeRiskLevel(parsed.merge_risk)
      if (!actualRisk) {
        process.stderr.write(`\n  Error: trust JSON merge_risk must be one of ${MERGE_RISK_ORDER.join(', ')}\n\n`)
        process.exit(1)
      }

      const trust: DriftTrustReport = {
        scannedAt: parsed.scannedAt ?? new Date().toISOString(),
        targetPath: parsed.targetPath ?? '.',
        trust_score: parsed.trust_score,
        merge_risk: actualRisk,
        top_reasons: parsed.top_reasons ?? [],
        fix_priorities: parsed.fix_priorities ?? [],
        diff_context: parsed.diff_context,
      }

      if (policy.enabled === false) {
        process.stdout.write(`Trust gate skipped by policy${branchName ? ` (branch: ${branchName})` : ''}\n`)
        return
      }

      if (shouldFailTrustGate(trust, policy)) {
        process.exit(1)
      }

      process.stdout.write(`Trust gate passed: trust=${trust.trust_score} risk=${trust.merge_risk}\n`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exit(1)
    }
  })

program
  .command('doctor')
  .description('Run project environment diagnostics')
  .option('--json', 'Output structured doctor JSON')
  .action(async (opts: { json?: boolean }) => {
    try {
      await runDoctor(process.cwd(), { json: opts.json })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`\n  Error: ${message}\n\n`)
      process.exitCode = 1
    }
  })

program
  .command('kpi <path>')
  .description('Aggregate trust KPIs from trust JSON artifacts')
  .option('--no-summary', 'Disable console KPI summary in stderr')
  .action((targetPath: string, options: { summary?: boolean }) => {
    try {
      const kpi = computeTrustKpis(targetPath)

      if (options.summary !== false) {
        process.stderr.write(`${formatTrustKpiConsole(kpi)}\n`)
      }

      process.stdout.write(`${formatTrustKpiJson(kpi)}\n`)
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

addResourceOptions(
  program
    .command('report [path]')
  .description('Generate a self-contained HTML report')
  .option('-o, --output <file>', 'Output file path (default: drift-report.html)', 'drift-report.html')
  .action(async (targetPath: string | undefined, options: { output: string } & ResourceOptionFlags) => {
    const resolvedPath = resolve(targetPath ?? '.')
    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
    process.stderr.write(`  Found ${files.length} TypeScript file(s)\n\n`)
    const report = buildReport(resolvedPath, files)
    const html = generateHtmlReport(report)
    const outPath = resolve(options.output)
    writeFileSync(outPath, html, 'utf8')
    process.stderr.write(`  Report saved to ${outPath}\n\n`)
  }),
)

addResourceOptions(
  program
    .command('badge [path]')
  .description('Generate a badge.svg with the current drift score')
  .option('-o, --output <file>', 'Output file path (default: badge.svg)', 'badge.svg')
  .action(async (targetPath: string | undefined, options: { output: string } & ResourceOptionFlags) => {
    const resolvedPath = resolve(targetPath ?? '.')
    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
    const report = buildReport(resolvedPath, files)
    const svg = generateBadge(report.totalScore)
    const outPath = resolve(options.output)
    writeFileSync(outPath, svg, 'utf8')
    process.stderr.write(`  Badge saved to ${outPath}\n`)
    process.stderr.write(`  Score: ${report.totalScore}/100\n\n`)
  }),
)

addResourceOptions(
  program
    .command('ci [path]')
  .description('Emit GitHub Actions annotations and step summary')
  .option('--format <type>', 'Output format: console|json|markdown|ai|sarif')
  .option('--json', 'Output raw JSON report (legacy alias for --format json)')
  .option('--min-score <n>', 'Exit with code 1 if overall score exceeds this threshold', '0')
  .action(async (targetPath: string | undefined, options: { format?: string; json?: boolean; minScore: string } & ResourceOptionFlags) => {
    const resolvedPath = resolve(targetPath ?? '.')
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
    const report = buildReport(resolvedPath, files)

    const format = resolveOutputFormat({
      command: 'ci',
      format: options.format,
      supported: ['console', 'json', 'sarif'],
      legacyAliases: [{ flag: 'json', used: options.json, mapsTo: 'json' }],
      onWarning: (message) => process.stderr.write(`${message}\n`),
    })

    if (format === 'sarif') {
      process.stdout.write(`${JSON.stringify(toSarif(report), null, 2)}\n`)
    } else if (format === 'json') {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    } else {
      emitCIAnnotations(report)
      printCISummary(report)
    }
    const minScore = Number(options.minScore)
    if (minScore > 0 && report.totalScore > minScore) {
      process.exit(1)
    }
  }),
)

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

addResourceOptions(
  program
    .command('snapshot [path]')
  .description('Record a score snapshot to drift-history.json')
  .option('-l, --label <label>', 'label for this snapshot (e.g. sprint name, version)')
  .option('--history', 'show all recorded snapshots')
  .option('--diff', 'compare current score vs last snapshot')
  .action(async (
    targetPath: string | undefined,
    opts: { label?: string; history?: boolean; diff?: boolean } & ResourceOptionFlags,
  ) => {
    const resolvedPath = resolve(targetPath ?? '.')

    if (opts.history) {
      const history = loadHistory(resolvedPath)
      printHistory(history)
      return
    }

    process.stderr.write(`\nScanning ${resolvedPath}...\n`)
    const config = await loadConfig(resolvedPath)
    const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(opts))
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
  }),
)

const cloud = program
  .command('cloud')
  .description('Local SaaS foundations: ingest, summary, and dashboard')

addResourceOptions(
  cloud
    .command('ingest [path]')
  .description('Scan path, build report, and store cloud snapshot')
  .option('--org <id>', 'Organization id (default: default-org)', 'default-org')
  .requiredOption('--workspace <id>', 'Workspace id')
  .requiredOption('--user <id>', 'User id')
  .option('--role <role>', 'Role hint (owner|member|viewer)')
  .option('--plan <plan>', 'Organization plan (free|sponsor|team|business)')
  .option('--repo <name>', 'Repo name (default: basename of scanned path)')
  .option('--actor <user>', 'Actor user id for permission checks (local-only authz context)')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .action(async (targetPath: string | undefined, options: { org: string; workspace: string; user: string; role?: string; plan?: string; repo?: string; actor?: string; store?: string } & ResourceOptionFlags) => {
    try {
      const resolvedPath = resolve(targetPath ?? '.')
      process.stderr.write(`\nScanning ${resolvedPath} for cloud ingest...\n`)
      const config = await loadConfig(resolvedPath)
      const files = analyzeProject(resolvedPath, config, resolveAnalysisOptions(options))
      const report = buildReport(resolvedPath, files)

      const snapshot = ingestSnapshotFromReport(report, {
        organizationId: options.org,
        workspaceId: options.workspace,
        userId: options.user,
        role: options.role as 'owner' | 'member' | 'viewer' | undefined,
        plan: options.plan as 'free' | 'sponsor' | 'team' | 'business' | undefined,
        repoName: options.repo ?? basename(resolvedPath),
        actorUserId: options.actor,
        storeFile: options.store,
        policy: config?.saas,
      })

      process.stdout.write(`Ingested snapshot ${snapshot.id}\n`)
      process.stdout.write(`Organization: ${snapshot.organizationId}  Workspace: ${snapshot.workspaceId}  Repo: ${snapshot.repoName}\n`)
      process.stdout.write(`Role: ${snapshot.role}  Plan: ${snapshot.plan}\n`)
      process.stdout.write(`Score: ${snapshot.totalScore}/100  Issues: ${snapshot.totalIssues}\n\n`)
    } catch (error) {
      printSaasErrorAndExit(error)
    }
  }),
)

cloud
  .command('summary')
  .description('Show SaaS usage metrics and free threshold status')
  .option('--json', 'Output raw JSON summary')
  .option('--org <id>', 'Filter summary by organization id')
  .option('--workspace <id>', 'Filter summary by workspace id')
  .option('--actor <user>', 'Actor user id for permission checks (local-only authz context)')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .action((options: { json?: boolean; org?: string; workspace?: string; actor?: string; store?: string }) => {
    try {
      const summary = getSaasSummary({
        storeFile: options.store,
        organizationId: options.org,
        workspaceId: options.workspace,
        actorUserId: options.actor,
      })

      if (options.json) {
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
        return
      }

      process.stdout.write('\n')
      process.stdout.write(`Phase: ${summary.phase.toUpperCase()}\n`)
      process.stdout.write(`Users registered: ${summary.usersRegistered}\n`)
      process.stdout.write(`Active workspaces (30d): ${summary.workspacesActive}\n`)
      process.stdout.write(`Active repos (30d): ${summary.reposActive}\n`)
      process.stdout.write(`Total snapshots: ${summary.totalSnapshots}\n`)
      process.stdout.write(`Free user threshold: ${summary.policy.freeUserThreshold}\n`)
      process.stdout.write(`Threshold reached: ${summary.thresholdReached ? 'yes' : 'no'}\n`)
      process.stdout.write(`Free users remaining: ${summary.freeUsersRemaining}\n`)
      process.stdout.write('Runs per month:\n')

      const monthly = Object.entries(summary.runsPerMonth).sort(([a], [b]) => a.localeCompare(b))
      if (monthly.length === 0) {
        process.stdout.write('  - none\n\n')
        return
      }

      for (const [month, runs] of monthly) {
        process.stdout.write(`  - ${month}: ${runs}\n`)
      }
      process.stdout.write('\n')
    } catch (error) {
      printSaasErrorAndExit(error)
    }
  })

cloud
  .command('plan-set')
  .description('Set organization plan (owner role required when actor is provided)')
  .requiredOption('--org <id>', 'Organization id')
  .requiredOption('--plan <plan>', 'New organization plan (free|sponsor|team|business)')
  .requiredOption('--actor <user>', 'Actor user id used for owner-gated billing writes')
  .option('--reason <text>', 'Optional reason for audit trail')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .option('--json', 'Output raw JSON plan change')
  .action((options: { org: string; plan: string; actor: string; reason?: string; store?: string; json?: boolean }) => {
    try {
      const change = changeOrganizationPlan({
        organizationId: options.org,
        actorUserId: options.actor,
        newPlan: options.plan as 'free' | 'sponsor' | 'team' | 'business',
        reason: options.reason,
        storeFile: options.store,
      })

      if (options.json) {
        process.stdout.write(JSON.stringify(change, null, 2) + '\n')
        return
      }

      process.stdout.write(`Plan updated for org '${change.organizationId}': ${change.fromPlan} -> ${change.toPlan}\n`)
      process.stdout.write(`Changed by: ${change.changedByUserId} at ${change.changedAt}\n`)
      if (change.reason) process.stdout.write(`Reason: ${change.reason}\n`)
    } catch (error) {
      printSaasErrorAndExit(error)
    }
  })

cloud
  .command('plan-changes')
  .description('List organization plan change audit trail')
  .requiredOption('--org <id>', 'Organization id')
  .requiredOption('--actor <user>', 'Actor user id used for billing read permissions')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .option('--json', 'Output raw JSON plan changes')
  .action((options: { org: string; actor: string; store?: string; json?: boolean }) => {
    try {
      const changes = listOrganizationPlanChanges({
        organizationId: options.org,
        actorUserId: options.actor,
        storeFile: options.store,
      })

      if (options.json) {
        process.stdout.write(JSON.stringify(changes, null, 2) + '\n')
        return
      }

      if (changes.length === 0) {
        process.stdout.write(`No plan changes found for org '${options.org}'.\n`)
        return
      }

      process.stdout.write(`Plan changes for org '${options.org}':\n`)
      for (const change of changes) {
        const reasonSuffix = change.reason ? ` reason='${change.reason}'` : ''
        process.stdout.write(`- ${change.changedAt}: ${change.fromPlan} -> ${change.toPlan} by ${change.changedByUserId}${reasonSuffix}\n`)
      }
    } catch (error) {
      printSaasErrorAndExit(error)
    }
  })

cloud
  .command('usage')
  .description('Show organization usage and effective limits')
  .requiredOption('--org <id>', 'Organization id')
  .requiredOption('--actor <user>', 'Actor user id used for billing read permissions')
  .option('--month <yyyy-mm>', 'Month filter for runCountThisMonth (default: current UTC month)')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .option('--json', 'Output usage and limits as raw JSON')
  .action((options: { org: string; actor: string; month?: string; store?: string; json?: boolean }) => {
    try {
      const usage = getOrganizationUsageSnapshot({
        organizationId: options.org,
        actorUserId: options.actor,
        month: options.month,
        storeFile: options.store,
      })
      const limits = getOrganizationEffectiveLimits({
        organizationId: options.org,
        storeFile: options.store,
      })

      if (options.json) {
        process.stdout.write(JSON.stringify({ usage, limits }, null, 2) + '\n')
        return
      }

      process.stdout.write(`Organization: ${usage.organizationId}\n`)
      process.stdout.write(`Plan: ${usage.plan}\n`)
      process.stdout.write(`Captured at: ${usage.capturedAt}\n`)
      process.stdout.write(`Workspace count: ${usage.workspaceCount}\n`)
      process.stdout.write(`Repo count: ${usage.repoCount}\n`)
      process.stdout.write(`Runs total: ${usage.runCount}\n`)
      process.stdout.write(`Runs this month: ${usage.runCountThisMonth}\n`)
      process.stdout.write('Effective limits:\n')
      process.stdout.write(`  - maxWorkspaces: ${limits.maxWorkspaces}\n`)
      process.stdout.write(`  - maxReposPerWorkspace: ${limits.maxReposPerWorkspace}\n`)
      process.stdout.write(`  - maxRunsPerWorkspacePerMonth: ${limits.maxRunsPerWorkspacePerMonth}\n`)
      process.stdout.write(`  - retentionDays: ${limits.retentionDays}\n`)
    } catch (error) {
      printSaasErrorAndExit(error)
    }
  })

cloud
  .command('dashboard')
  .description('Generate an HTML dashboard with trends and hotspots')
  .option('-o, --output <file>', 'Output HTML file', 'drift-cloud-dashboard.html')
  .option('--store <file>', 'Store file path (default: .drift-cloud/store.json)')
  .action((options: { output: string; store?: string }) => {
    const html = generateSaasDashboardHtml({ storeFile: options.store })
    const outPath = resolve(options.output)
    writeFileSync(outPath, html, 'utf8')
    process.stdout.write(`Dashboard saved to ${outPath}\n`)
  })

if (process.argv.includes('ai-guard') && process.argv.includes('--file')) {
  process.stderr.write("\n  Error: unknown option '--file'; use --diff-file\n\n")
  process.exitCode = 2
} else {
  program.parse()
}
