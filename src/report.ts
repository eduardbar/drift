import { basename } from 'node:path'
import { DriftReport, DriftIssue } from './types.js'

const VERSION = '0.6.0'

function severityColor(severity: DriftIssue['severity']): string {
  switch (severity) {
    case 'error':   return '#ef4444'
    case 'warning': return '#eab308'
    case 'info':    return '#94a3b8'
  }
}

function severityIcon(severity: DriftIssue['severity']): string {
  switch (severity) {
    case 'error':   return '✖'
    case 'warning': return '▲'
    case 'info':    return '◦'
  }
}

function scoreColor(score: number): string {
  if (score < 20) return '#22c55e'
  if (score < 45) return '#eab308'
  if (score < 70) return '#f97316'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score < 20) return 'LOW'
  if (score < 45) return 'MODERATE'
  if (score < 70) return 'HIGH'
  return 'CRITICAL'
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function generateHtmlReport(report: DriftReport): string {
  const projectName = basename(report.targetPath)
  const scanDate = new Date(report.scannedAt).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const projColor = scoreColor(report.totalScore)
  const projLabel = scoreLabel(report.totalScore)

  // count totals
  let totalErrors = 0
  let totalWarnings = 0
  let totalInfos = 0
  for (const f of report.files) {
    for (const issue of f.issues) {
      if (issue.severity === 'error') totalErrors++
      else if (issue.severity === 'warning') totalWarnings++
      else totalInfos++
    }
  }

  const filesWithIssues = report.files.filter(f => f.issues.length > 0).length

  // top issues by rule
  const byRule: Record<string, { count: number; severity: DriftIssue['severity'] }> = {}
  for (const f of report.files) {
    for (const issue of f.issues) {
      if (!byRule[issue.rule]) {
        byRule[issue.rule] = { count: 0, severity: issue.severity }
      }
      byRule[issue.rule].count++
      // escalate severity if needed
      const cur = byRule[issue.rule].severity
      if (issue.severity === 'error') byRule[issue.rule].severity = 'error'
      else if (issue.severity === 'warning' && cur !== 'error') byRule[issue.rule].severity = 'warning'
    }
  }

  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)

  const topRulesRows = topRules.map(([rule, { count, severity }]) => {
    const icon = severityIcon(severity)
    const color = severityColor(severity)
    return `
          <tr>
            <td><span class="sev-icon" style="color:${color}">${icon}</span> <span class="rule-name">${escapeHtml(rule)}</span></td>
            <td class="count-cell">${count}</td>
          </tr>`
  }).join('')

  // files sections — already sorted by score desc from buildReport
  const fileSections = report.files
    .filter(f => f.issues.length > 0)
    .map(f => {
      const hasError = f.issues.some(i => i.severity === 'error')
      const openAttr = hasError ? ' open' : ''
      const fColor = scoreColor(f.score)
      const fLabel = scoreLabel(f.score)

      const issueItems = f.issues.map(issue => {
        const ic = severityColor(issue.severity)
        const ii = severityIcon(issue.severity)
        const snippet = issue.snippet
          ? `<pre class="snippet"><code>${escapeHtml(issue.snippet)}</code></pre>`
          : ''
        return `
            <li class="issue-item">
              <div class="issue-header">
                <span class="sev-icon" style="color:${ic}">${ii}</span>
                <span class="issue-location">Line ${issue.line}${issue.column > 0 ? `:${issue.column}` : ''}</span>
                <span class="issue-rule">${escapeHtml(issue.rule)}</span>
                <span class="issue-message">${escapeHtml(issue.message)}</span>
              </div>
              ${snippet}
            </li>`
      }).join('')

      return `
        <details${openAttr} class="file-section">
          <summary class="file-summary">
            <span class="file-path">${escapeHtml(f.path)}</span>
            <span class="file-score" style="color:${fColor}">${f.score} <span class="file-label">${fLabel}</span></span>
            <span class="file-count">${f.issues.length} issue${f.issues.length !== 1 ? 's' : ''}</span>
          </summary>
          <ul class="issue-list">${issueItems}
          </ul>
        </details>`
    }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>drift report — ${escapeHtml(projectName)}</title>
  <style>
    :root {
      --bg:          #0a0a0f;
      --bg-card:     #111118;
      --bg-code:     #1e1e2e;
      --border:      #2a2a3a;
      --text:        #e2e8f0;
      --muted:       #94a3b8;
      --accent:      #6366f1;
      --error:       #ef4444;
      --warning:     #eab308;
      --info:        #94a3b8;
      --green:       #22c55e;
      --font-mono:   ui-monospace, "Cascadia Code", "Fira Code", Consolas, monospace;
      --radius:      6px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 14px;
      line-height: 1.6;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }

    .header-left h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .header-left .scan-date {
      color: var(--muted);
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }

    .score-block {
      text-align: right;
    }

    .score-number {
      font-size: 4rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .score-label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-top: 0.2rem;
    }

    /* ── Stats row ── */
    .stats-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      flex: 1 1 140px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.9rem 1.1rem;
    }

    .stat-card .stat-value {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1;
    }

    .stat-card .stat-label {
      color: var(--muted);
      font-size: 0.75rem;
      margin-top: 0.3rem;
    }

    .stat-card .sev-breakdown {
      display: flex;
      gap: 0.8rem;
      margin-top: 0.4rem;
      font-size: 0.8rem;
    }

    /* ── Top rules table ── */
    .section-title {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.75rem;
    }

    .rules-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .rules-table th {
      text-align: left;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .rules-table td {
      padding: 0.55rem 1rem;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .rules-table tr:last-child td { border-bottom: none; }

    .rules-table .count-cell {
      text-align: right;
      color: var(--muted);
      font-size: 0.85rem;
      width: 60px;
    }

    .rule-name { color: var(--text); }
    .sev-icon { margin-right: 0.4rem; }

    /* ── File sections ── */
    .files-section { margin-top: 2rem; }

    .file-section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 0.75rem;
      overflow: hidden;
    }

    .file-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .file-summary::-webkit-details-marker { display: none; }

    .file-summary::before {
      content: '▶';
      font-size: 0.65rem;
      color: var(--muted);
      transition: transform 0.15s;
      flex-shrink: 0;
    }

    details[open] > .file-summary::before { transform: rotate(90deg); }

    .file-path {
      flex: 1;
      font-size: 0.85rem;
      word-break: break-all;
    }

    .file-score {
      font-size: 0.9rem;
      font-weight: 700;
    }

    .file-label {
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .file-count {
      font-size: 0.75rem;
      color: var(--muted);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 99px;
      padding: 0.1rem 0.55rem;
      white-space: nowrap;
    }

    /* ── Issue list ── */
    .issue-list {
      list-style: none;
      padding: 0 1rem 0.75rem;
    }

    .issue-item {
      padding: 0.6rem 0;
      border-top: 1px solid var(--border);
    }

    .issue-header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.4rem 0.75rem;
      font-size: 0.82rem;
    }

    .issue-location {
      color: var(--muted);
      font-size: 0.75rem;
      white-space: nowrap;
    }

    .issue-rule {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0 0.35rem;
      font-size: 0.72rem;
      color: var(--muted);
      white-space: nowrap;
    }

    .issue-message {
      color: var(--text);
      flex: 1;
    }

    /* ── Snippet ── */
    .snippet {
      background: var(--bg-code);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.65rem 0.9rem;
      margin-top: 0.5rem;
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    .snippet code {
      font-family: var(--font-mono);
      white-space: pre;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.75rem;
      text-align: center;
    }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .score-number { font-size: 2.8rem; }
      .header { flex-direction: column; align-items: flex-start; }
      .score-block { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>${escapeHtml(projectName)}</h1>
        <div class="scan-date">Scanned ${escapeHtml(scanDate)}</div>
      </div>
      <div class="score-block">
        <div class="score-number" style="color:${projColor}">${report.totalScore}</div>
        <div class="score-label" style="color:${projColor}">${projLabel}</div>
      </div>
    </header>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${report.totalFiles}</div>
        <div class="stat-label">Files scanned</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${filesWithIssues}</div>
        <div class="stat-label">Files with issues</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.totalIssues}</div>
        <div class="stat-label">Total issues</div>
        <div class="sev-breakdown">
          <span style="color:var(--error)">✖ ${totalErrors}</span>
          <span style="color:var(--warning)">▲ ${totalWarnings}</span>
          <span style="color:var(--info)">◦ ${totalInfos}</span>
        </div>
      </div>
    </div>

    <!-- Top rules -->
    ${topRules.length > 0 ? `<div class="section-title">Top issues by rule</div>
    <table class="rules-table">
      <thead>
        <tr>
          <th>Rule</th>
          <th style="text-align:right">Count</th>
        </tr>
      </thead>
      <tbody>${topRulesRows}
      </tbody>
    </table>` : ''}

    <!-- Files -->
    <div class="files-section">
      <div class="section-title">Files with issues</div>
      ${fileSections || '<p style="color:var(--muted);font-size:0.85rem">No issues found.</p>'}
    </div>

    <!-- Footer -->
    <footer class="footer">Generated by drift v${VERSION}</footer>

  </div>
</body>
</html>`
}
