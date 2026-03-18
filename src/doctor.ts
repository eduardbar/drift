import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import kleur from 'kleur'

export interface DoctorOptions {
  json?: boolean
}

interface DoctorReport {
  targetPath: string
  node: {
    version: string
    major: number
    supported: boolean
  }
  project: {
    packageJsonFound: boolean
    esm: boolean
    tsconfigFound: boolean
    sourceFilesCount: number
    lowMemorySuggested: boolean
    driftConfigFile: string | null
  }
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.next', 'coverage'])
const DRIFT_CONFIG_CANDIDATES = [
  'drift.config.ts',
  'drift.config.js',
  'drift.config.mjs',
  'drift.config.cjs',
  'drift.config.json',
] as const

function parseNodeMajor(version: string): number {
  const parsed = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function detectDriftConfig(projectPath: string): string | null {
  for (const candidate of DRIFT_CONFIG_CANDIDATES) {
    if (existsSync(join(projectPath, candidate))) {
      return candidate
    }
  }
  return null
}

function countSourceFiles(projectPath: string): number {
  let total = 0
  const stack = [projectPath]

  while (stack.length > 0) {
    const currentDir = stack.pop()
    if (!currentDir) continue

    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(join(currentDir, entry.name))
        }
        continue
      }

      if (!entry.isFile()) continue

      const lastDot = entry.name.lastIndexOf('.')
      if (lastDot === -1) continue

      const extension = entry.name.slice(lastDot)
      if (SOURCE_EXTENSIONS.has(extension)) {
        total += 1
      }
    }
  }

  return total
}

function buildDoctorReport(projectPath: string): DoctorReport {
  const nodeMajor = parseNodeMajor(process.version)
  const packageJsonPath = join(projectPath, 'package.json')
  const packageJsonFound = existsSync(packageJsonPath)

  let esm = false
  if (packageJsonFound) {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { type?: string }
    esm = parsed.type === 'module'
  }

  const sourceFilesCount = countSourceFiles(projectPath)

  return {
    targetPath: projectPath,
    node: {
      version: process.version,
      major: nodeMajor,
      supported: nodeMajor >= 18,
    },
    project: {
      packageJsonFound,
      esm,
      tsconfigFound: existsSync(join(projectPath, 'tsconfig.json')),
      sourceFilesCount,
      lowMemorySuggested: sourceFilesCount > 500,
      driftConfigFile: detectDriftConfig(projectPath),
    },
  }
}

function printConsoleReport(report: DoctorReport): void {
  const icons = {
    check: kleur.green('✓'),
    warn: kleur.yellow('⚠'),
    error: kleur.red('✗'),
    info: kleur.cyan('ℹ'),
  }

  process.stdout.write('\n')
  process.stdout.write(`${kleur.bold().white('drift doctor')} ${kleur.gray('- environment diagnostics')}\n\n`)

  const nodeStatus = report.node.supported
    ? `${icons.check} ${kleur.green('Node runtime supported')}`
    : `${icons.warn} ${kleur.yellow('Node runtime below recommended minimum (>=18)')}`
  process.stdout.write(`${nodeStatus} ${kleur.gray(`(${report.node.version})`)}\n`)

  if (report.project.packageJsonFound) {
    process.stdout.write(`${icons.check} package.json found\n`)
    process.stdout.write(`${icons.info} ESM mode: ${report.project.esm ? kleur.green('yes') : kleur.yellow('no')}\n`)
  } else {
    process.stdout.write(`${icons.warn} package.json not found\n`)
    process.stdout.write(`${icons.info} ESM mode: ${kleur.gray('unknown')}\n`)
  }

  if (report.project.tsconfigFound) {
    process.stdout.write(`${icons.check} tsconfig.json found\n`)
  } else {
    process.stdout.write(`${icons.warn} tsconfig.json not found\n`)
  }

  process.stdout.write(`${icons.info} Source files (.ts/.tsx/.js/.jsx): ${report.project.sourceFilesCount}\n`)

  if (report.project.lowMemorySuggested) {
    process.stdout.write(`${icons.warn} Large codebase detected, consider ${kleur.bold('--low-memory')}\n`)
  }

  if (report.project.driftConfigFile) {
    process.stdout.write(`${icons.check} Drift config: ${report.project.driftConfigFile}\n`)
  } else {
    process.stdout.write(`${icons.warn} Drift config not found (drift.config.*)\n`)
  }

  process.stdout.write('\n')
}

export async function runDoctor(projectPath: string, options?: DoctorOptions): Promise<number> {
  const report = buildDoctorReport(projectPath)

  if (options?.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    printConsoleReport(report)
  }

  return 0
}
