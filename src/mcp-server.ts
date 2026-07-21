// drift-ignore-file
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Implementation,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { analyzeProject, RULE_WEIGHTS } from './analyzer.js'
import { loadConfig } from './config.js'
import { runGuard } from './guard.js'
import { buildReport, formatAIOutput } from './reporter.js'
import { loadHistory } from './snapshot.js'
import { scoreToGradeText } from './utils.js'
import { createDebouncedWatcher, type DebouncedWatcher } from './watch-utils.js'
import type { DriftAnalysisOptions, DriftReport } from './types.js'
import type { MCPToolDefinition } from './types/mcp.js'

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }

/**
 * Stderr-only logger. Keeping stdout pure JSON-RPC is critical for MCP clients.
 */
function log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
  process.stderr.write(`[${level}] ${message}\n`)
}

interface DriftEntry {
  report?: DriftReport
  watcher?: DebouncedWatcher
}

const GENERATED_WATCH_DIRECTORIES = new Set([
  '.git',
  '.drift',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'out',
])

function canonicalProjectPath(projectPath: string): string {
  return resolve(projectPath)
}

function shouldIgnoreWatchPath(projectPath: string, eventPath: string): boolean {
  const segments = relative(projectPath, eventPath).split(/[\\/]/).filter(Boolean)
  return segments.some((segment) => GENERATED_WATCH_DIRECTORIES.has(segment))
    || segments.some((segment) => segment === 'drift-history.json' || segment.endsWith('.tmp'))
}

/**
 * Shared cache for drift reports used by the MCP server.
 *
 * - Returns the cached report when available.
 * - Serializes concurrent requests for the same project path.
 * - Can be invalidated manually or via a debounced file watcher.
 */
export class SessionCache {
  private reports = new Map<string, DriftEntry>()
  private pending = new Map<string, Promise<DriftReport>>()
  private analysisOptions?: DriftAnalysisOptions

  constructor(analysisOptions?: DriftAnalysisOptions) {
    this.analysisOptions = analysisOptions
  }

  async getReport(
    projectPath: string,
    generate: () => Promise<DriftReport>,
  ): Promise<DriftReport> {
    const canonicalPath = canonicalProjectPath(projectPath)
    const cached = this.reports.get(canonicalPath)
    if (cached?.report) return cached.report

    const inFlight = this.pending.get(canonicalPath)
    if (inFlight) return inFlight

    this.watch(canonicalPath)

    const promise = generate()
      .then((report) => {
        const existing = this.reports.get(canonicalPath)
        this.reports.set(canonicalPath, { report, watcher: existing?.watcher })
        this.pending.delete(canonicalPath)
        return report
      })
      .catch((error) => {
        this.pending.delete(canonicalPath)
        this.reports.get(canonicalPath)?.watcher?.close()
        this.reports.delete(canonicalPath)
        throw error
      })

    this.pending.set(canonicalPath, promise)
    return promise
  }

  invalidate(projectPath: string): void {
    const canonicalPath = canonicalProjectPath(projectPath)
    const cached = this.reports.get(canonicalPath)
    if (cached?.watcher) {
      cached.watcher.close()
    }
    this.reports.delete(canonicalPath)
  }

  watch(projectPath: string, onChange?: () => void): DebouncedWatcher {
    const canonicalPath = canonicalProjectPath(projectPath)
    const cached = this.reports.get(canonicalPath)
    if (cached?.watcher) {
      return cached.watcher
    }

    const watcher = createDebouncedWatcher(
      canonicalPath,
      () => {
        log('debug', `Invalidating cache for ${canonicalPath}`)
        this.invalidate(canonicalPath)
        onChange?.()
      },
      300,
      (eventPath) => shouldIgnoreWatchPath(canonicalPath, eventPath),
    )

    if (cached) {
      cached.watcher = watcher
    } else {
      this.reports.set(canonicalPath, { watcher })
    }

    return watcher
  }

  clear(): void {
    for (const cached of this.reports.values()) {
      cached.watcher?.close()
    }
    this.reports.clear()
    this.pending.clear()
  }
}

export function buildToolDefinitions(): MCPToolDefinition[] {
  return [
    {
      name: 'drift_score',
      description: 'Get the current drift score for the project or a specific file.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project root' },
          file: { type: 'string', description: 'Optional file path to scope the score' },
        },
      },
    },
    {
      name: 'drift_analyze',
      description: 'Analyze a file or the whole project and return the top violations.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project root' },
          file: { type: 'string', description: 'Optional file path to scope the analysis' },
          maxIssues: { type: 'number', description: 'Maximum number of violations to return' },
        },
      },
    },
    {
      name: 'drift_rules',
      description: 'List the active drift rules and their severity/weight.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'drift_trend',
      description: 'Get the score trend over the last N recorded drift runs.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project root' },
          n: { type: 'number', description: 'Number of historical runs to include' },
        },
      },
    },
    {
      name: 'drift_suggest',
      description: 'Suggest files that need refactoring, sorted by drift score.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project root' },
          limit: { type: 'number', description: 'Maximum number of files to suggest' },
        },
      },
    },
    {
      name: 'drift_guard_check',
      description: 'Check whether a diff against a base ref would exceed the drift budget.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project root' },
          baseRef: { type: 'string', description: 'Git base ref to compare against' },
          budget: { type: 'number', description: 'Allowed score delta budget' },
        },
      },
    },
  ]
}

export function inspectMCPTools(): MCPToolDefinition[] {
  return buildToolDefinitions()
}

interface ToolContext {
  projectPath: string
  cache: SessionCache
  analysisOptions?: DriftAnalysisOptions
}

function resolveProjectPath(args: Record<string, unknown>, ctx: ToolContext): string {
  const fromArgs = typeof args.projectPath === 'string' ? args.projectPath : undefined
  return resolve(fromArgs ?? ctx.projectPath)
}

async function loadReport(
  projectPath: string,
  ctx: ToolContext,
): Promise<DriftReport> {
  return ctx.cache.getReport(projectPath, async () => {
    const config = await loadConfig(projectPath)
    const files = analyzeProject(projectPath, config, ctx.analysisOptions)
    return buildReport(projectPath, files)
  })
}

async function handleScore(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const projectPath = resolveProjectPath(args, ctx)
  const report = await loadReport(projectPath, ctx)
  const grade = scoreToGradeText(report.totalScore)

  if (typeof args.file === 'string' && args.file) {
    const target = resolve(projectPath, args.file)
    const fileReport = report.files.find((f) => f.path === target)
    if (!fileReport) {
      return { score: 0, totalFiles: report.totalFiles, totalIssues: 0, grade: grade.label.toUpperCase() }
    }
    return {
      score: fileReport.score,
      totalFiles: report.totalFiles,
      totalIssues: fileReport.issues.length,
      grade: grade.label.toUpperCase(),
    }
  }

  return {
    score: report.totalScore,
    totalFiles: report.totalFiles,
    totalIssues: report.totalIssues,
    grade: grade.label.toUpperCase(),
  }
}

async function handleAnalyze(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const projectPath = resolveProjectPath(args, ctx)
  const report = await loadReport(projectPath, ctx)
  const aiOutput = formatAIOutput(report)
  const maxIssues = typeof args.maxIssues === 'number' ? args.maxIssues : 20

  if (typeof args.file === 'string' && args.file) {
    const target = resolve(projectPath, args.file)
    const fileReport = report.files.find((f) => f.path === target)
    if (!fileReport) {
      return { violations: [] }
    }
    const fileAi = formatAIOutput({
      ...report,
      files: [fileReport],
      totalFiles: 1,
      totalIssues: fileReport.issues.length,
    })
    return {
      violations: fileAi.priority_order.slice(0, maxIssues).map((issue) => ({
        rank: issue.rank,
        file: issue.file,
        line: issue.line,
        rule: issue.rule,
        severity: issue.severity,
        message: issue.message,
        snippet: issue.snippet,
        fixSuggestion: issue.fix_suggestion,
        effort: issue.effort,
      })),
    }
  }

  return {
    violations: aiOutput.priority_order.slice(0, maxIssues).map((issue) => ({
      rank: issue.rank,
      file: issue.file,
      line: issue.line,
      rule: issue.rule,
      severity: issue.severity,
      message: issue.message,
      snippet: issue.snippet,
      fixSuggestion: issue.fix_suggestion,
      effort: issue.effort,
    })),
  }
}

async function handleRules(): Promise<unknown> {
  const rules = Object.entries(RULE_WEIGHTS).map(([id, meta]) => ({
    id,
    severity: meta.severity,
    weight: meta.weight,
    enabled: true,
  }))
  return { rules }
}

async function handleTrend(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const projectPath = resolveProjectPath(args, ctx)
  const n = typeof args.n === 'number' ? args.n : 10
  const history = loadHistory(projectPath)
  const trend = history.snapshots.slice(-Math.max(1, n)).map((entry) => ({
    date: entry.timestamp,
    score: entry.score,
    grade: entry.grade,
    totalIssues: entry.totalIssues,
  }))
  return { trend }
}

async function handleSuggest(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const projectPath = resolveProjectPath(args, ctx)
  const report = await loadReport(projectPath, ctx)
  const limit = typeof args.limit === 'number' ? args.limit : 5
  const suggestions = report.files
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((file) => {
      const topRule = file.issues[0]?.rule ?? 'none'
      return {
        file: file.path,
        score: file.score,
        issues: file.issues.length,
        topRule,
      }
    })
  return { suggestions }
}

async function handleGuardCheck(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const projectPath = resolveProjectPath(args, ctx)
  const baseRef = typeof args.baseRef === 'string' ? args.baseRef : 'HEAD~1'
  const budget = typeof args.budget === 'number' ? args.budget : undefined

  const result = await runGuard(projectPath, {
    baseRef,
    budget,
    analysis: ctx.analysisOptions,
  })

  return {
    passed: result.passed,
    scoreDelta: result.metrics.scoreDelta,
    totalIssuesDelta: result.metrics.totalIssuesDelta,
    severityDelta: result.metrics.severityDelta,
    checks: result.checks,
  }
}

function buildToolHandlers(ctx: ToolContext): Map<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return new Map([
    ['drift_score', (args) => handleScore(args, ctx)],
    ['drift_analyze', (args) => handleAnalyze(args, ctx)],
    ['drift_rules', () => handleRules()],
    ['drift_trend', (args) => handleTrend(args, ctx)],
    ['drift_suggest', (args) => handleSuggest(args, ctx)],
    ['drift_guard_check', (args) => handleGuardCheck(args, ctx)],
  ])
}

export interface MCPServerOptions {
  projectPath?: string
  analysisOptions?: DriftAnalysisOptions
  cache?: SessionCache
  onClose?: () => void
}

export function createMCPServer(options: MCPServerOptions = {}): Server {
  const projectPath = resolve(options.projectPath ?? process.cwd())
  const cache = options.cache ?? new SessionCache(options.analysisOptions)
  const ctx: ToolContext = {
    projectPath,
    cache,
    analysisOptions: options.analysisOptions,
  }

  const serverInfo: Implementation = {
    name: 'drift-mcp-server',
    version: VERSION,
  }

  const server = new Server(serverInfo, {
    capabilities: { tools: {} },
  })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolDefinitions(),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const args = request.params.arguments ?? {}

    if (!name) {
      throw new McpError(ErrorCode.InvalidRequest, 'Tool name is required')
    }

    const handlers = buildToolHandlers(ctx)
    const handler = handlers.get(name)
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
    }

    const result = await handler(args)
    const content: TextContent[] = [
      { type: 'text', text: JSON.stringify(result) },
    ]
    return { content } as CallToolResult
  })

  server.onclose = () => {
    cache.clear()
    options.onClose?.()
  }

  return server
}

export interface RunMcpServerOptions extends MCPServerOptions {
  stdin?: Readable
  stdout?: Writable
}

export async function runMcpServer(options: RunMcpServerOptions = {}): Promise<Server> {
  const server = createMCPServer(options)
  const transport = new StdioServerTransport(options.stdin, options.stdout)

  let shutdownPromise: Promise<void> | undefined
  const shutdown = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (shutdownPromise) return
    log('info', `Received ${signal}, shutting down MCP server`)
    shutdownPromise = server.close()
      .then(() => {
        // StdioServerTransport detaches its listeners but does not release the
        // process stdin pipe. Unref it after the server has closed so Node can
        // finish naturally without an abrupt process.exit or SIGKILL fallback.
        options.stdin?.pause()
        if (!options.stdin) {
          process.stdin.pause()
          process.stdin.unref?.()
          process.stdin.destroy()
        }
        process.exit(0)
      })
      .catch((error) => {
        log('error', String(error))
        process.exitCode = 1
      })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  // Windows does not deliver POSIX signals to child processes. Treating an
  // orderly stdin close as the equivalent shutdown path keeps the CLI
  // graceful when its parent cannot deliver SIGTERM.
  process.stdin.once('end', () => shutdown('SIGTERM'))

  await server.connect(transport)
  log('info', `MCP server connected for ${resolve(options.projectPath ?? process.cwd())}`)
  return server
}
