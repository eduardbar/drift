import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeProject } from './analyzer.js'
import { buildReport } from './reporter.js'
import { loadConfig } from './config.js'
import { scoreToGrade } from './utils.js'

interface InitOptions {
  preset?: string
  ci?: boolean
  baseline?: boolean
}

export const INIT_PRESETS = ['node-backend', 'react-app', 'hexagonal', 'monorepo'] as const
type InitPreset = (typeof INIT_PRESETS)[number]

type InitBaselineGrade = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

const CONFIG_PRESET_CONTENT: Record<InitPreset, string> = {
  'node-backend': `import type { DriftConfig } from '@eduardbar/drift'

export default {
  layers: [
    {
      name: 'api',
      patterns: ['src/routes/**', 'src/controllers/**'],
      canImportFrom: ['services', 'middleware', 'types'],
    },
    {
      name: 'services',
      patterns: ['src/services/**'],
      canImportFrom: ['db', 'types'],
    },
    {
      name: 'db',
      patterns: ['src/db/**', 'src/models/**'],
      canImportFrom: ['types'],
    },
    {
      name: 'types',
      patterns: ['src/types/**'],
      canImportFrom: [],
    },
  ],
} satisfies DriftConfig
`,
  'react-app': `import type { DriftConfig } from '@eduardbar/drift'

export default {
  layers: [
    {
      name: 'pages',
      patterns: ['src/pages/**', 'src/app/**'],
      canImportFrom: ['components', 'hooks', 'services', 'types'],
    },
    {
      name: 'components',
      patterns: ['src/components/**'],
      canImportFrom: ['hooks', 'types'],
    },
    {
      name: 'hooks',
      patterns: ['src/hooks/**'],
      canImportFrom: ['services', 'types'],
    },
    {
      name: 'services',
      patterns: ['src/services/**', 'src/api/**'],
      canImportFrom: ['types'],
    },
    {
      name: 'types',
      patterns: ['src/types/**'],
      canImportFrom: [],
    },
  ],
} satisfies DriftConfig
`,
  hexagonal: `import type { DriftConfig } from '@eduardbar/drift'

export default {
  layers: [
    {
      name: 'adapters',
      patterns: ['src/adapters/**', 'src/infrastructure/**'],
      canImportFrom: ['application', 'domain'],
    },
    {
      name: 'application',
      patterns: ['src/application/**', 'src/use-cases/**'],
      canImportFrom: ['domain'],
    },
    {
      name: 'domain',
      patterns: ['src/domain/**'],
      canImportFrom: [],
    },
  ],
} satisfies DriftConfig
`,
  monorepo: `import type { DriftConfig } from '@eduardbar/drift'

export default {
  modules: [
    {
      name: 'shared',
      root: 'packages/shared',
      allowedExternalImports: [],
    },
    {
      name: 'api',
      root: 'packages/api',
      allowedExternalImports: ['@myorg/shared'],
    },
    {
      name: 'web',
      root: 'packages/web',
      allowedExternalImports: ['@myorg/shared'],
    },
  ],
} satisfies DriftConfig
`,
}

const GITHUB_WORKFLOW_TEMPLATE = `name: drift PR Review

on:
  pull_request:
    branches: [main, master, develop]

permissions:
  contents: read
  pull-requests: write

jobs:
  drift-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install drift
        run: npm install -g @eduardbar/drift

      - name: Run drift review
        id: drift
        run: |
          npx drift review --base origin/\${{ github.base_ref }} --comment > drift-comment.md
          echo "score=$(cat drift-comment.md | grep 'Score:' | awk '{print $2}')" >> $GITHUB_OUTPUT

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const comment = fs.readFileSync('drift-comment.md', 'utf8')

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            })

            const botComment = comments.find(c =>
              c.user?.type === 'Bot' && c.body?.includes('<!-- drift-review -->')
            )

            const body = '<!-- drift-review -->\\n\\n' + comment

            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body,
              })
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              })
            }
`

function mapScoreToBaselineGrade(score: number): InitBaselineGrade {
  const { label } = scoreToGrade(score)

  if (label === 'clean') return 'CLEAN'
  if (label === 'low') return 'LOW'
  if (label === 'moderate') return 'MEDIUM'
  if (label === 'high') return 'HIGH'

  return 'CRITICAL'
}

/**
 * Initialize drift configuration with optional presets and scaffolding.
 * 
 * @param projectRoot - Absolute path to project root
 * @param options - Init options from CLI
 */
export async function runInit(projectRoot: string, options: InitOptions): Promise<void> {
  const tasks: string[] = []

  maybeWritePresetConfig(projectRoot, options.preset, tasks)
  maybeWriteCiWorkflow(projectRoot, options.ci, tasks)
  await maybeWriteBaseline(projectRoot, options.baseline, tasks)

  if (tasks.length === 0) {
    process.stdout.write('\n  No actions taken. Use --preset, --ci, or --baseline flags.\n\n')
  } else {
    process.stdout.write('\n  drift init complete:\n\n')
    for (const task of tasks) {
      process.stdout.write(`    ${task}\n`)
    }
    process.stdout.write('\n')
  }
}

function isInitPreset(value: string): value is InitPreset {
  return INIT_PRESETS.includes(value as InitPreset)
}

function maybeWritePresetConfig(projectRoot: string, preset: string | undefined, tasks: string[]): void {
  if (!preset) return

  if (!isInitPreset(preset)) {
    throw new Error(`Invalid preset '${preset}'. Use one of: ${INIT_PRESETS.join(', ')}`)
  }

  const configPath = join(projectRoot, 'drift.config.ts')
  if (existsSync(configPath)) {
    process.stderr.write(`  ⚠️  drift.config.ts already exists, skipping config generation\n`)
    return
  }

  writeFileSync(configPath, generateConfigPreset(preset), 'utf8')
  tasks.push('✅ Generated drift.config.ts')
}

function maybeWriteCiWorkflow(projectRoot: string, ci: boolean | undefined, tasks: string[]): void {
  if (!ci) return

  const workflowDir = join(projectRoot, '.github', 'workflows')
  const workflowPath = join(workflowDir, 'drift-review.yml')
  if (existsSync(workflowPath)) {
    process.stderr.write(`  ⚠️  .github/workflows/drift-review.yml already exists, skipping workflow generation\n`)
    return
  }

  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true })
  }

  writeFileSync(workflowPath, generateGitHubWorkflow(), 'utf8')
  tasks.push('✅ Generated .github/workflows/drift-review.yml')
}

async function maybeWriteBaseline(projectRoot: string, baseline: boolean | undefined, tasks: string[]): Promise<void> {
  if (!baseline) return

  const baselinePath = join(projectRoot, 'drift-baseline.json')
  if (existsSync(baselinePath)) {
    process.stderr.write(`  ⚠️  drift-baseline.json already exists, skipping baseline creation\n`)
    return
  }

  process.stderr.write('  Scanning project to create baseline...\n')
  const config = await loadConfig(projectRoot)
  const files = analyzeProject(projectRoot, config)
  const report = buildReport(projectRoot, files)

  const baselineSnapshot = {
    createdAt: new Date().toISOString(),
    score: report.totalScore,
    grade: mapScoreToBaselineGrade(report.totalScore),
    totalIssues: report.totalIssues,
    files: report.files.length,
  }

  writeFileSync(baselinePath, JSON.stringify(baselineSnapshot, null, 2), 'utf8')
  tasks.push(`✅ Created drift-baseline.json (score: ${report.totalScore}/100, grade: ${baselineSnapshot.grade})`)
}

function generateConfigPreset(preset: InitPreset): string {
  return CONFIG_PRESET_CONTENT[preset]
}

function generateGitHubWorkflow(): string {
  return GITHUB_WORKFLOW_TEMPLATE
}
