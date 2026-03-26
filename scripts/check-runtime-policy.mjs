import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EXPECTED_ENGINE_RANGE = '^20.0.0 || ^22.0.0'
const EXPECTED_NODE_MATRIX = '["20", "22"]'
const EXPECTED_README_RUNTIME = '**Runtime:** Node.js 20.x and 22.x (LTS)'
const EXPECTED_INIT_TEMPLATE_NODE_VERSION = 'node-version: 20'

function readRepoFile(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

function assertIncludes(content, expected, errorMessage) {
  if (!content.includes(expected)) {
    throw new Error(errorMessage)
  }
}

function main() {
  const packageJson = JSON.parse(readRepoFile('package.json'))
  const engineRange = packageJson?.engines?.node

  if (engineRange !== EXPECTED_ENGINE_RANGE) {
    throw new Error(
      `Invalid package.json engines.node: expected "${EXPECTED_ENGINE_RANGE}", got "${String(engineRange)}"`,
    )
  }

  const qualityWorkflow = readRepoFile('.github/workflows/quality.yml')
  assertIncludes(
    qualityWorkflow,
    `node_versions: '${EXPECTED_NODE_MATRIX}'`,
    `quality.yml must declare node_versions: '${EXPECTED_NODE_MATRIX}'`,
  )

  const reusableWorkflow = readRepoFile('.github/workflows/reusable-quality-checks.yml')
  assertIncludes(
    reusableWorkflow,
    `default: '${EXPECTED_NODE_MATRIX}'`,
    `reusable-quality-checks.yml must declare default: '${EXPECTED_NODE_MATRIX}'`,
  )

  const initTemplate = readRepoFile('src/init.ts')
  assertIncludes(
    initTemplate,
    EXPECTED_INIT_TEMPLATE_NODE_VERSION,
    `src/init.ts workflow template must include: ${EXPECTED_INIT_TEMPLATE_NODE_VERSION}`,
  )

  const readme = readRepoFile('README.md')
  assertIncludes(
    readme,
    EXPECTED_README_RUNTIME,
    `README runtime line must include: ${EXPECTED_README_RUNTIME}`,
  )

  const lockfile = readRepoFile('package-lock.json')
  assertIncludes(lockfile, '"node_modules/commander"', 'package-lock must include commander entry')
  assertIncludes(lockfile, '"node": ">=20"', 'commander dependency requires Node >=20; runtime policy cannot be lower')

  process.stdout.write(
    `Runtime policy check passed: engines.node=${EXPECTED_ENGINE_RANGE}, matrix=${EXPECTED_NODE_MATRIX}, docs aligned.\n`,
  )
}

main()
