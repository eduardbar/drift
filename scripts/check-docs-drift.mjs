import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function readRepoFile(rootDir, relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8')
}

function readPackageVersion(rootDir) {
  const packageJson = JSON.parse(readRepoFile(rootDir, 'package.json'))
  const version = packageJson?.version
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('package.json is missing a valid version field')
  }
  return version
}

function extractRuleIdsFromAnalyzer(analyzerContent) {
  const blockMatch = analyzerContent.match(/export const RULE_WEIGHTS[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  if (!blockMatch) {
    throw new Error('Could not locate RULE_WEIGHTS block in src/analyzer.ts')
  }

  return Array.from(blockMatch[1].matchAll(/'([^']+)'\s*:/g), (match) => match[1])
}

function extractRuleIdsFromCatalog(catalogContent) {
  const ids = []
  for (const match of catalogContent.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) {
    const id = match[1]
    if (id !== 'id') {
      ids.push(id)
    }
  }
  return ids
}

function extractSingleNumber(content, pattern, errorMessage) {
  const match = content.match(pattern)
  if (!match) {
    throw new Error(errorMessage)
  }
  return Number.parseInt(match[1], 10)
}

function extractAgentsVersion(agentsContent) {
  const match = agentsContent.match(/Versi[oó]n del paquete:\s*`([^`]+)`/)
  if (!match) {
    throw new Error('AGENTS.md must include "Versión del paquete: `<version>`"')
  }
  return match[1]
}

function compareRuleSets(sourceRuleIds, catalogRuleIds) {
  const sourceSet = new Set(sourceRuleIds)
  const catalogSet = new Set(catalogRuleIds)

  const missingInCatalog = [...sourceSet].filter((ruleId) => !catalogSet.has(ruleId)).sort()
  const extraInCatalog = [...catalogSet].filter((ruleId) => !sourceSet.has(ruleId)).sort()

  return { missingInCatalog, extraInCatalog }
}

export function validateDocsDrift(rootDir = process.cwd()) {
  const packageVersion = readPackageVersion(rootDir)
  const analyzer = readRepoFile(rootDir, 'src/analyzer.ts')
  const rulesCatalog = readRepoFile(rootDir, 'docs/rules-catalog.md')
  const readme = readRepoFile(rootDir, 'README.md')
  const agents = readRepoFile(rootDir, 'AGENTS.md')

  const sourceRuleIds = extractRuleIdsFromAnalyzer(analyzer)
  const catalogRuleIds = extractRuleIdsFromCatalog(rulesCatalog)
  const sourceRuleCount = sourceRuleIds.length

  const readmeRuleCount = extractSingleNumber(
    readme,
    /defines\s+\*\*(\d+)\s+rule IDs\*\*/,
    'README.md must declare the current rule ID count as "defines **<n> rule IDs**"',
  )
  const agentsRuleCount = extractSingleNumber(
    agents,
    /Estado actual:\s+\*\*(\d+)\s+rule IDs\*\*/,
    'AGENTS.md must declare the current rule ID count as "Estado actual: **<n> rule IDs**"',
  )
  const catalogRuleCount = extractSingleNumber(
    rulesCatalog,
    /Total rule IDs currently defined:\s+\*\*(\d+)\*\*/,
    'docs/rules-catalog.md must declare the current rule count line',
  )
  const agentsVersion = extractAgentsVersion(agents)
  const { missingInCatalog, extraInCatalog } = compareRuleSets(sourceRuleIds, catalogRuleIds)

  const errors = []

  if (agentsVersion !== packageVersion) {
    errors.push(`AGENTS.md package version (${agentsVersion}) does not match package.json (${packageVersion})`)
  }

  if (!rulesCatalog.includes('Source of truth: `RULE_WEIGHTS` in `src/analyzer.ts`.')) {
    errors.push('docs/rules-catalog.md must explicitly declare RULE_WEIGHTS in src/analyzer.ts as source of truth')
  }

  if (catalogRuleIds.length !== sourceRuleCount) {
    errors.push(`docs/rules-catalog.md table has ${catalogRuleIds.length} rule IDs, but RULE_WEIGHTS defines ${sourceRuleCount}`)
  }

  if (missingInCatalog.length > 0) {
    errors.push(`rules missing in docs/rules-catalog.md: ${missingInCatalog.join(', ')}`)
  }

  if (extraInCatalog.length > 0) {
    errors.push(`rules present in docs/rules-catalog.md but not in RULE_WEIGHTS: ${extraInCatalog.join(', ')}`)
  }

  if (readmeRuleCount !== sourceRuleCount) {
    errors.push(`README.md rule ID count (${readmeRuleCount}) does not match RULE_WEIGHTS (${sourceRuleCount})`)
  }

  if (agentsRuleCount !== sourceRuleCount) {
    errors.push(`AGENTS.md rule ID count (${agentsRuleCount}) does not match RULE_WEIGHTS (${sourceRuleCount})`)
  }

  if (catalogRuleCount !== sourceRuleCount) {
    errors.push(`docs/rules-catalog.md total rule ID count (${catalogRuleCount}) does not match RULE_WEIGHTS (${sourceRuleCount})`)
  }

  return {
    ok: errors.length === 0,
    packageVersion,
    sourceRuleCount,
    errors,
  }
}

export function runDocsDriftCheck(rootDir = process.cwd()) {
  const result = validateDocsDrift(rootDir)

  if (!result.ok) {
    process.stderr.write('Docs drift check failed:\n')
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`)
    }
    process.exitCode = 1
    return
  }

  process.stdout.write(
    `Docs drift check passed: package version ${result.packageVersion}, rule IDs ${result.sourceRuleCount}, docs aligned.\n`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDocsDriftCheck()
}
