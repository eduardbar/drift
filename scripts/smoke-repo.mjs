import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SMOKE_SCHEMA_VERSION = 'drift-smoke/v1'
const SMOKE_SCRIPT_VERSION = '1.0.0'
const DEFAULT_BASE_REF = 'HEAD~1'
const SNIPPET_MAX_LINES = 24
const SNIPPET_MAX_CHARS = 2400
const LOG_MAX_BUFFER = 32 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const TIMEOUT_ERROR_CODE = 'ETIMEDOUT'

function printHelp() {
  process.stdout.write(
    [
      'drift repo smoke',
      '',
      'Usage:',
      '  node ./scripts/smoke-repo.mjs <target-path> [--base <ref>] [--out <dir>] [--timeout <ms>] [--dry-run]',
      '',
      'Options:',
      `  --base <ref>   Git base ref for review/trust (default: ${DEFAULT_BASE_REF})`,
      '  --out <dir>    Output directory (default: .drift-smoke/<repo>-<timestamp>)',
      `  --timeout <ms> Command timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
      '  --dry-run      Print planned commands and exit without running them',
      '  --ai-integration Run bounded built-CLI context/MCP/ai-guard smoke',
      '  --help         Show this help',
      '',
      'Examples:',
      '  npm run smoke:repo -- ../my-repo',
      '  npm run smoke:repo -- ../my-repo --base origin/main',
      '  npm run smoke:repo -- ../my-repo --dry-run',
      '',
      'This script is non-destructive for target repos.',
    ].join('\n') + '\n',
  )
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function toSnippet(text) {
  const lines = String(text || '').split(/\r?\n/).slice(0, SNIPPET_MAX_LINES)
  const joined = lines.join('\n').trim()
  if (joined.length <= SNIPPET_MAX_CHARS) return joined
  return `${joined.slice(0, SNIPPET_MAX_CHARS)}...`
}

export function parseArgs(argv) {
  const options = {
    targetPath: '.',
    baseRef: DEFAULT_BASE_REF,
    outDir: undefined,
    timeoutMs: undefined,
    dryRun: false,
    aiIntegration: false,
    help: false,
  }
  let targetPathSet = false

  let index = 0
  while (index < argv.length) {
    const token = argv[index]

    if (token === '--help' || token === '-h') {
      options.help = true
      index += 1
      continue
    }

    if (token === '--dry-run') {
      options.dryRun = true
      index += 1
      continue
    }

    if (token === '--ai-integration') {
      options.aiIntegration = true
      index += 1
      continue
    }

    if (token === '--base') {
      const next = argv[index + 1]
      if (!next) throw new Error('--base requires a value')
      options.baseRef = next
      index += 2
      continue
    }

    if (token === '--out') {
      const next = argv[index + 1]
      if (!next) throw new Error('--out requires a value')
      options.outDir = next
      index += 2
      continue
    }

    if (token === '--timeout') {
      const next = argv[index + 1]
      if (!next) throw new Error('--timeout requires a value')
      const timeoutMs = Number(next)
      if (!/^\d+$/.test(next) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout must be a positive integer')
      }
      options.timeoutMs = timeoutMs
      index += 2
      continue
    }

    if (token.startsWith('--')) {
      throw new Error(`Unknown option: ${token}`)
    }

    if (!targetPathSet) {
      options.targetPath = token
      targetPathSet = true
    } else {
      throw new Error(`Unexpected positional argument: ${token}`)
    }

    index += 1
  }

  return options
}

export function resolveTimeoutMs(options, env = process.env) {
  if (options.timeoutMs !== undefined) return options.timeoutMs

  const configuredTimeout = env.DRIFT_SMOKE_TIMEOUT_MS
  if (configuredTimeout === undefined) return DEFAULT_TIMEOUT_MS
  const timeoutMs = Number(configuredTimeout)
  if (!/^\d+$/.test(configuredTimeout) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DRIFT_SMOKE_TIMEOUT_MS must be a positive integer')
  }
  return timeoutMs
}

function runGit(cwd, args, timeoutMs) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: LOG_MAX_BUFFER,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    windowsHide: true,
  })
}

export function runDriftCommand({ id, description, args, cwd, logsDir, expectFailure, cliPath, tsxLoaderSpecifier, input, timeoutMs, useBuiltCli = false, spawn = spawnSync }) {
  const start = Date.now()
  const startedAt = new Date(start).toISOString()
  const commandArgs = useBuiltCli ? [cliPath, ...args] : ['--import', tsxLoaderSpecifier, cliPath, ...args]
  const child = spawn(process.execPath, commandArgs, {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: LOG_MAX_BUFFER,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    windowsHide: true,
  })
  const end = Date.now()
  const finishedAt = new Date(end).toISOString()

  const stdout = child.stdout ?? ''
  const timedOut = child.error?.code === TIMEOUT_ERROR_CODE
  const spawnError = timedOut
    ? `Error: command timed out after ${timeoutMs}ms; termination signal ${child.signal ?? 'SIGTERM'} was sent`
    : child.error ? `${child.error.name}: ${child.error.message}` : ''
  const stderr = `${child.stderr ?? ''}${spawnError ? `\n${spawnError}\n` : ''}`
  const stdoutFile = resolve(logsDir, `${id}.stdout.log`)
  const stderrFile = resolve(logsDir, `${id}.stderr.log`)
  writeFileSync(stdoutFile, stdout, 'utf8')
  writeFileSync(stderrFile, stderr, 'utf8')

  const exitCode = child.status == null ? -1 : child.status
  const signal = child.signal ?? null

  let status = 'fail'
  if (expectFailure) {
    status = exitCode === 0 ? 'fail' : 'expected-fail'
  } else {
    status = exitCode === 0 ? 'pass' : 'fail'
  }

  return {
    id,
    description,
    command: `node ${commandArgs.join(' ')}`,
    args,
    status,
    expectedFailure: expectFailure,
    exitCode,
    signal,
    processId: child.pid,
    timeoutMs,
    timedOut,
    durationMs: end - start,
    startedAt,
    finishedAt,
    stdoutSnippet: toSnippet(stdout),
    stderrSnippet: toSnippet(stderr),
    stdoutLog: stdoutFile,
    stderrLog: stderrFile,
  }
}

function markdownForSummary(report) {
  const lines = []
  lines.push('# drift repository smoke summary')
  lines.push('')
  lines.push(`- schema: ${report.schemaVersion}`)
  lines.push(`- generated_at: ${report.generatedAt}`)
  lines.push(`- target_repo: ${report.targetPath}`)
  lines.push(`- base_ref: ${report.baseRef}`)
  lines.push(`- overall_status: ${report.overallStatus}`)
  lines.push(`- pass: ${report.totals.pass} | expected-fail: ${report.totals.expectedFail} | fail: ${report.totals.fail}`)
  lines.push('')
  lines.push('## Commands')
  lines.push('')
  lines.push('| id | status | duration_ms | exit | notes |')
  lines.push('|---|---|---:|---:|---|')

  for (const result of report.commands) {
    const note = result.expectedFailure ? 'expected non-zero exit' : 'expected zero exit'
    lines.push(`| ${result.id} | ${result.status} | ${result.durationMs} | ${result.exitCode} | ${note} |`)
  }

  lines.push('')
  lines.push('## Artifacts')
  lines.push('')
  lines.push(`- report_json: ${report.artifacts.reportJson}`)
  lines.push(`- summary_md: ${report.artifacts.summaryMarkdown}`)
  lines.push(`- trust_json: ${report.artifacts.trustJson}`)
  lines.push(`- architecture_svg: ${report.artifacts.architectureSvg}`)
  lines.push(`- html_report: ${report.artifacts.htmlReport}`)
  lines.push(`- kpi_json: ${report.artifacts.kpiJson}`)

  return `${lines.join('\n')}\n`
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }
  const timeoutMs = resolveTimeoutMs(opts)

  const scriptPath = fileURLToPath(import.meta.url)
  const repoRoot = resolve(scriptPath, '..', '..')
  const cliPath = resolve(repoRoot, opts.aiIntegration ? 'dist' : 'src', opts.aiIntegration ? 'cli.js' : 'cli.ts')
  const packageJsonPath = resolve(repoRoot, 'package.json')
  const tsxLoaderPath = resolve(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')
  if (!existsSync(tsxLoaderPath)) {
    throw new Error(`Missing tsx loader at ${tsxLoaderPath}. Run npm ci in drift repository first.`)
  }
  const tsxLoaderSpecifier = pathToFileURL(tsxLoaderPath).href
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

  const targetPath = resolve(process.cwd(), opts.targetPath)
  const targetStat = statSync(targetPath)
  if (!targetStat.isDirectory()) {
    throw new Error(`Target path must be a directory: ${targetPath}`)
  }
  const outputDir = opts.outDir
    ? resolve(process.cwd(), opts.outDir)
    : resolve(repoRoot, '.drift-smoke', `${basename(targetPath) || 'repo'}-${nowStamp()}`)

  const logsDir = resolve(outputDir, 'logs')
  const artifactsDir = resolve(outputDir, 'artifacts')
  const trustDir = resolve(artifactsDir, 'trust')

  const trustJson = resolve(trustDir, 'drift-trust.json')
  const architectureSvg = resolve(artifactsDir, 'architecture.svg')
  const htmlReport = resolve(artifactsDir, 'drift-report.html')
  const kpiJson = resolve(artifactsDir, 'trust-kpi.json')
  const reportJson = resolve(outputDir, 'smoke-report.json')
  const summaryMarkdown = resolve(outputDir, 'smoke-summary.md')

  const gitRepoProbe = runGit(targetPath, ['rev-parse', '--is-inside-work-tree'], timeoutMs)
  const isGitRepo = gitRepoProbe.status === 0
  const gitBaseProbe = isGitRepo ? runGit(targetPath, ['rev-parse', '--verify', `${opts.baseRef}^{commit}`], timeoutMs) : null
  const baseRefResolvable = Boolean(gitBaseProbe && gitBaseProbe.status === 0)
  const gitReady = isGitRepo && baseRefResolvable

  const contextOutput = resolve(outputDir, 'artifacts', 'context.md')
  const packageFirstLine = readFileSync(resolve(targetPath, 'package.json'), 'utf8').split(/\r?\n/, 1)[0]
  const safeDiff = `--- a/package.json\n+++ b/package.json\n@@ -1 +1,2 @@\n ${packageFirstLine}\n+\n`
  const plan = opts.aiIntegration ? [
    {
      id: 'context-generate',
      description: 'generate AI-readable context document',
      args: ['context', targetPath, '--output', contextOutput],
      expectFailure: false,
      useBuiltCli: true,
    },
    {
      id: 'context-ci-fresh',
      description: 'verify context freshness in CI mode',
      args: ['context', targetPath, '--output', contextOutput, '--ci'],
      expectFailure: false,
      useBuiltCli: true,
    },
    {
      id: 'mcp-inspect',
      description: 'inspect the local MCP tool contract without starting a server',
      args: ['mcp', targetPath, '--inspect'],
      expectFailure: false,
      useBuiltCli: true,
    },
    {
      id: 'ai-guard-safe',
      description: 'audit a safe representative diff',
      args: ['ai-guard', targetPath, '--stdin', '--format', 'json'],
      input: safeDiff,
      expectFailure: false,
      useBuiltCli: true,
    },
    {
      id: 'ai-guard-safe-repeat',
      description: 'repeat the safe diff for deterministic output',
      args: ['ai-guard', targetPath, '--stdin', '--format', 'json'],
      input: safeDiff,
      expectFailure: false,
      useBuiltCli: true,
    },
  ] : [
    {
      id: 'scan-json',
      description: 'scan output as JSON',
      args: ['scan', '.', '--json'],
      expectFailure: false,
    },
    {
      id: 'scan-ai',
      description: 'scan output as AI JSON',
      args: ['scan', '.', '--ai'],
      expectFailure: false,
    },
    {
      id: 'review-base-json',
      description: 'review against base ref as JSON',
      args: ['review', '--base', opts.baseRef, '--json'],
      expectFailure: !gitReady,
    },
    {
      id: 'trust-base-json-output',
      description: 'trust JSON + trust artifact output',
      args: ['trust', '.', '--base', opts.baseRef, '--json', '--json-output', trustJson],
      expectFailure: !gitReady,
    },
    {
      id: 'trust-gate-strict',
      description: 'strict trust gate expected to fail',
      args: ['trust-gate', trustJson, '--min-trust', '101', '--max-risk', 'LOW'],
      expectFailure: true,
    },
    {
      id: 'trust-gate-relaxed',
      description: 'relaxed trust gate expected to pass',
      args: ['trust-gate', trustJson, '--min-trust', '0', '--max-risk', 'CRITICAL'],
      expectFailure: !gitReady,
    },
    {
      id: 'fix-preview',
      description: 'fix preview mode only',
      args: ['fix', '.', '--preview'],
      expectFailure: false,
    },
    {
      id: 'map-output',
      description: 'generate architecture map artifact',
      args: ['map', '.', '--output', architectureSvg],
      expectFailure: false,
    },
    {
      id: 'report-output',
      description: 'generate html report artifact',
      args: ['report', '.', '--output', htmlReport],
      expectFailure: false,
    },
    {
      id: 'kpi-trust-artifacts',
      description: 'compute trust KPIs from artifacts',
      args: ['kpi', trustDir],
      expectFailure: false,
      captureStdoutAs: kpiJson,
    },
  ]

  if (opts.dryRun) {
    process.stdout.write(`drift smoke dry-run (${SMOKE_SCHEMA_VERSION})\n`)
    process.stdout.write(`target: ${targetPath}\n`)
    process.stdout.write(`base: ${opts.baseRef}\n`)
    process.stdout.write(`timeout_ms: ${timeoutMs}\n`)
    process.stdout.write(`output: ${outputDir}\n`)
    process.stdout.write(`git_ready: ${gitReady}\n\n`)
    for (const item of plan) {
        process.stdout.write(`- ${item.id}: node --import ${tsxLoaderSpecifier} ${cliPath} ${item.args.join(' ')}\n`)
    }
    return
  }

  mkdirSync(logsDir, { recursive: true })
  mkdirSync(trustDir, { recursive: true })

  const commandResults = []

  for (const item of plan) {
    const result = runDriftCommand({
      id: item.id,
      description: item.description,
      args: item.args,
      cwd: targetPath,
      logsDir,
      expectFailure: item.expectFailure,
      cliPath,
      tsxLoaderSpecifier,
      input: item.input,
      timeoutMs,
      useBuiltCli: item.useBuiltCli,
    })

    if (item.captureStdoutAs) {
      writeFileSync(item.captureStdoutAs, readFileSync(result.stdoutLog, 'utf8'), 'utf8')
    }

    commandResults.push(result)
  }

  const totals = {
    pass: commandResults.filter((result) => result.status === 'pass').length,
    expectedFail: commandResults.filter((result) => result.status === 'expected-fail').length,
    fail: commandResults.filter((result) => result.status === 'fail').length,
  }

  const overallStatus = totals.fail > 0 ? 'fail' : 'pass'

  const report = {
    schemaVersion: SMOKE_SCHEMA_VERSION,
    smokeScriptVersion: SMOKE_SCRIPT_VERSION,
    driftVersion: packageJson.version,
    generatedAt: new Date().toISOString(),
    targetPath,
    baseRef: opts.baseRef,
    timeoutMs,
    outputDir,
    overallStatus,
    gitContext: {
      isGitRepo,
      baseRefResolvable,
      gitReady,
    },
    totals,
    artifacts: {
      reportJson,
      summaryMarkdown,
      trustJson,
      architectureSvg,
      htmlReport,
      kpiJson,
    },
    commands: commandResults,
  }

  writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(summaryMarkdown, markdownForSummary(report), 'utf8')

  process.stdout.write(`drift smoke complete: ${overallStatus.toUpperCase()}\n`)
  process.stdout.write(`report: ${reportJson}\n`)
  process.stdout.write(`summary: ${summaryMarkdown}\n`)

  if (overallStatus === 'fail') {
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Error: ${message}\n`)
    process.exit(1)
  }
}
