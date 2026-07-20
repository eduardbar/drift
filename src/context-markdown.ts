import type { ContextArchitectureSummary, ContextDocument, ContextViolation } from './types.js'

function formatViolation(violation: ContextViolation): string {
  return [
    `### ${violation.rank}. \`${violation.file}\` — Line ${violation.line}`,
    '',
    `- **Line**: ${violation.line}`,
    `- **Rule**: \`${violation.rule}\` (${violation.severity})`,
    `- **Message**: ${violation.message}`,
    `- **Fix suggestion**: ${violation.fixSuggestion}`,
    `- **Effort**: ${violation.effort}`,
    '',
    '```typescript',
    violation.snippet,
    '```',
    '',
  ].join('\n')
}

function formatArchitectureSummary(summary: ContextArchitectureSummary): string {
  return [
    `- **Layers**: ${summary.layers.length > 0 ? summary.layers.join(', ') : 'none configured'}`,
    `- **Modules**: ${summary.modules.length > 0 ? summary.modules.join(', ') : 'none configured'}`,
    `- **Circular dependencies**: ${summary.circularDependencies}`,
  ].join('\n')
}

export function formatContextMarkdown(doc: ContextDocument): string {
  const lines: string[] = [
    '# Drift Context', '',
    `<!-- drift-context-metadata: score=${doc.health.score} generatedAt=${doc.generatedAt} driftVersion=${doc.driftVersion} -->`,
    '', `> Generated: ${new Date(doc.generatedAt).toLocaleString()}`,
    `> Drift version: ${doc.driftVersion}`, `> Project path: \`${doc.projectPath}\``, '',
    '## Project Health', '', `- **Score**: ${doc.health.score}/100 (${doc.health.grade})`,
    `- **Total issues**: ${doc.health.totalIssues}`, `- **Errors**: ${doc.health.errors}`,
    `- **Warnings**: ${doc.health.warnings}`, `- **Infos**: ${doc.health.infos}`,
    `- **Files affected**: ${doc.health.filesAffected}`, `- **Files clean**: ${doc.health.filesClean}`,
    '', '## Active Violations', '',
  ]

  if (doc.topViolations.length === 0) lines.push('No active violations.')
  else for (const violation of doc.topViolations) lines.push(formatViolation(violation))

  lines.push('', '## Architecture Summary', '', formatArchitectureSummary(doc.architectureSummary), '')
  lines.push('## AI Coding Guidelines', '', ...doc.guidelines, '')
  lines.push('## Recommended Actions', '', ...doc.recommendedActions, '')
  return lines.join('\n')
}
