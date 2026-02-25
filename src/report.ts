// drift-ignore-file
import { basename } from 'node:path'
import { createRequire } from 'node:module'
import { DriftReport, DriftIssue } from './types.js'

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityColor(severity: DriftIssue['severity']): string {
  switch (severity) {
    case 'error':   return '#ef4444'
    case 'warning': return '#f59e0b'
    case 'info':    return '#3b82f6'
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

function scoreGrade(score: number): string {
  if (score < 20) return 'A'
  if (score < 40) return 'B'
  if (score < 60) return 'C'
  if (score < 80) return 'D'
  return 'F'
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── CSS ────────────────────────────────────────────────────────────────────

function buildCss(): string {
  return `
    :root {
      --bg:        #0a0a0f;
      --bg-card:   #12121a;
      --bg-hover:  #1a1a2e;
      --bg-code:   #0d0d17;
      --border:    #2a2a3a;
      --text:      #ffffff;
      --muted:     #94a3b8;
      --accent:    #6366f1;
      --accent-2:  #8b5cf6;
      --error:     #ef4444;
      --warning:   #f59e0b;
      --info:      #3b82f6;
      --success:   #22c55e;
      --font-mono: ui-monospace, "Cascadia Code", "Fira Code", Consolas, monospace;
      --radius:    6px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Layout ── */
    #app {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    header.top-header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
    }

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .project-title {
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .scan-meta {
      color: var(--muted);
      font-size: 0.75rem;
    }

    .stats-cards {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .stat-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.65rem 1rem;
      min-width: 130px;
    }

    .stat-card .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
    }

    .stat-card .stat-label {
      color: var(--muted);
      font-size: 0.7rem;
      margin-top: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ── Sidebar ── */
    #sidebar {
      width: 280px;
      flex-shrink: 0;
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .sidebar-block {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .sidebar-label {
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* Score block in sidebar */
    .score-block {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
    }

    .score-number {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .score-right {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .score-label {
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .grade-badge {
      display: inline-block;
      font-size: 1.1rem;
      font-weight: 800;
      width: 2rem;
      height: 2rem;
      line-height: 2rem;
      text-align: center;
      border-radius: 4px;
      background: var(--bg-hover);
      border: 1px solid var(--border);
    }

    /* Severity checkboxes */
    .sev-check-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .sev-check-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.82rem;
      padding: 0.25rem 0.4rem;
      border-radius: 4px;
    }

    .sev-check-item:hover { background: var(--bg-hover); }

    .sev-check-item input[type="checkbox"] {
      accent-color: var(--accent);
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    .sev-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* File search */
    #file-search {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.8rem;
      padding: 0.45rem 0.7rem;
      outline: none;
      transition: border-color 0.15s;
    }

    #file-search:focus { border-color: var(--accent); }
    #file-search::placeholder { color: var(--muted); }

    /* Rules list */
    .rules-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 280px;
      overflow-y: auto;
    }

    .rule-filter-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      text-align: left;
      border-left: 3px solid transparent;
      transition: background 0.1s, border-color 0.1s;
    }

    .rule-filter-btn:hover { background: var(--bg-hover); }

    .rule-filter-btn.active {
      border-left-color: var(--accent);
      background: var(--bg-hover);
      color: var(--accent);
    }

    .rule-filter-btn .rule-count {
      color: var(--muted);
      font-size: 0.7rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 99px;
      padding: 0 0.4rem;
      min-width: 1.6rem;
      text-align: center;
      flex-shrink: 0;
    }

    .rule-filter-btn.active .rule-count {
      background: var(--bg-hover);
      border-color: var(--accent);
    }

    /* Reset button */
    #reset-filters {
      width: 100%;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.4rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }

    #reset-filters:hover {
      border-color: var(--accent);
      color: var(--text);
    }

    /* ── Main panel ── */
    #main {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.25rem;
    }

    .main-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    #issue-counter {
      font-size: 0.75rem;
      color: var(--muted);
    }

    /* ── File sections ── */
    .file-section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 0.6rem;
      overflow: hidden;
    }

    .file-section > summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
      padding: 0.65rem 0.9rem;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .file-section > summary::-webkit-details-marker { display: none; }

    .file-section > summary::before {
      content: '▶';
      font-size: 0.6rem;
      color: var(--muted);
      transition: transform 0.15s;
      flex-shrink: 0;
    }

    details[open] > summary::before { transform: rotate(90deg); }

    .file-section > summary:hover { background: var(--bg-hover); }

    .file-name {
      font-size: 0.82rem;
      font-weight: 600;
      flex: 1;
      word-break: break-all;
    }

    .file-path-full {
      font-size: 0.7rem;
      color: var(--muted);
      word-break: break-all;
      flex-basis: 100%;
      padding-left: 1.2rem;
    }

    .file-score {
      font-size: 0.85rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .issue-badge {
      font-size: 0.68rem;
      font-weight: 600;
      border-radius: 99px;
      padding: 0.08rem 0.5rem;
      border: 1px solid;
      white-space: nowrap;
    }

    .issue-badge.error   { color: var(--error);   border-color: var(--error);   background: #ef444418; }
    .issue-badge.warning { color: var(--warning); border-color: var(--warning); background: #f59e0b18; }
    .issue-badge.info    { color: var(--info);    border-color: var(--info);    background: #3b82f618; }

    /* ── Issue rows ── */
    .issues-list {
      padding: 0 0.9rem 0.75rem;
    }

    .issue-row {
      display: grid;
      grid-template-columns: 52px 20px 1fr;
      grid-template-rows: auto auto;
      column-gap: 0.5rem;
      row-gap: 0.2rem;
      padding: 0.55rem 0;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
    }

    .issue-line {
      color: var(--muted);
      font-size: 0.72rem;
      white-space: nowrap;
      align-self: center;
    }

    .issue-sev {
      align-self: center;
      font-size: 0.75rem;
    }

    .issue-rule-msg {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.4rem;
      grid-column: 3;
    }

    .issue-rule {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0 0.3rem;
      font-size: 0.7rem;
      color: var(--muted);
      white-space: nowrap;
    }

    .issue-msg {
      color: var(--text);
      font-size: 0.8rem;
    }

    .issue-snippet {
      grid-column: 1 / -1;
      background: var(--bg-code);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      margin-top: 0.35rem;
      font-size: 12px;
      font-family: var(--font-mono);
      overflow-x: auto;
      white-space: pre;
      line-height: 1.5;
    }

    /* ── Empty state ── */
    .empty-state {
      text-align: center;
      color: var(--muted);
      padding: 3rem 1rem;
      font-size: 0.85rem;
    }

    /* ── Footer ── */
    .footer {
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      padding: 0.6rem 1.5rem;
      color: var(--muted);
      font-size: 0.7rem;
      text-align: center;
    }

    /* ── Scrollbars ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

    /* ── Responsive ── */
    @media (max-width: 700px) {
      .layout { flex-direction: column; }
      #sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--border);
        max-height: 50vh;
      }
      .score-number { font-size: 2.2rem; }
    }
  `
}

// ─── JS ─────────────────────────────────────────────────────────────────────

function buildJs(): string {
  return `
    const state = {
      severities: new Set(['error', 'warning', 'info']),
      rule: null,
      fileSearch: '',
    };

    function applyFilters() {
      let visibleCount = 0;
      let totalCount = 0;

      document.querySelectorAll('.file-section').forEach(function(section) {
        const issues = section.querySelectorAll('.issue-row');
        let fileVisible = 0;

        issues.forEach(function(issue) {
          const sev = issue.dataset.severity;
          const rule = issue.dataset.rule;
          const visible =
            state.severities.has(sev) &&
            (state.rule === null || state.rule === rule);

          issue.style.display = visible ? '' : 'none';
          if (visible) { visibleCount++; fileVisible++; }
          totalCount++;
        });

        const filePath = (section.dataset.path || '').toLowerCase();
        const searchMatch = state.fileSearch === '' || filePath.includes(state.fileSearch);
        section.style.display = (fileVisible > 0 && searchMatch) ? '' : 'none';
      });

      const counter = document.getElementById('issue-counter');
      if (counter) {
        counter.textContent = 'Showing ' + visibleCount + ' of ' + totalCount + ' issues';
      }
    }

    document.querySelectorAll('.severity-filter').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) {
          state.severities.add(cb.value);
        } else {
          state.severities.delete(cb.value);
        }
        applyFilters();
      });
    });

    var fileSearch = document.getElementById('file-search');
    if (fileSearch) {
      fileSearch.addEventListener('input', function(e) {
        state.fileSearch = e.target.value.toLowerCase();
        applyFilters();
      });
    }

    document.querySelectorAll('.rule-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (state.rule === btn.dataset.rule) {
          state.rule = null;
          btn.classList.remove('active');
        } else {
          document.querySelectorAll('.rule-filter-btn').forEach(function(b) {
            b.classList.remove('active');
          });
          state.rule = btn.dataset.rule;
          btn.classList.add('active');
        }
        applyFilters();
      });
    });

    var resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        state.severities = new Set(['error', 'warning', 'info']);
        state.rule = null;
        state.fileSearch = '';
        document.querySelectorAll('.severity-filter').forEach(function(cb) {
          cb.checked = true;
        });
        document.querySelectorAll('.rule-filter-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        var fs = document.getElementById('file-search');
        if (fs) fs.value = '';
        applyFilters();
      });
    }

    applyFilters();
  `
}

// ─── Main export ────────────────────────────────────────────────────────────

export function generateHtmlReport(report: DriftReport): string {
  const projectName = basename(report.targetPath)
  const scanDate = new Date(report.scannedAt).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const projColor = scoreColor(report.totalScore)
  const projLabel = scoreLabel(report.totalScore)
  const projGrade = scoreGrade(report.totalScore)

  const filesWithIssues = report.files.filter(f => f.issues.length > 0).length

  // ── Top rules for sidebar ──────────────────────────────────────────────
  const topRules = Object.entries(report.summary.byRule)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)

  const ruleItems = topRules.map(([rule, count]) => `
        <button class="rule-filter-btn" data-rule="${escapeHtml(rule)}">
          <span class="rule-name">${escapeHtml(rule)}</span>
          <span class="rule-count">${count}</span>
        </button>`).join('')

  // ── File sections ──────────────────────────────────────────────────────
  const fileSections = report.files
    .filter(f => f.issues.length > 0)
    .sort((a, b) => {
      const aErr = a.issues.filter(i => i.severity === 'error').length
      const bErr = b.issues.filter(i => i.severity === 'error').length
      return bErr - aErr || b.score - a.score
    })
    .map(f => {
      const hasError = f.issues.some(i => i.severity === 'error')
      const fColor = scoreColor(f.score)
      const errCount = f.issues.filter(i => i.severity === 'error').length
      const warnCount = f.issues.filter(i => i.severity === 'warning').length
      const infoCount = f.issues.filter(i => i.severity === 'info').length

      const issueRows = f.issues.map(issue => {
        const sev = issue.severity
        const ic = severityColor(sev)
        const ii = severityIcon(sev)
        const snippet = issue.snippet
          ? `<pre class="issue-snippet">${escapeHtml(issue.snippet)}</pre>`
          : ''
        const col = issue.column > 0 ? `:${issue.column}` : ''
        return `
            <div class="issue-row" data-severity="${sev}" data-rule="${escapeHtml(issue.rule)}">
              <span class="issue-line">L${issue.line}${escapeHtml(col)}</span>
              <span class="issue-sev" style="color:${ic}">${ii}</span>
              <div class="issue-rule-msg">
                <span class="issue-rule">${escapeHtml(issue.rule)}</span>
                <span class="issue-msg">${escapeHtml(issue.message)}</span>
              </div>
              ${snippet}
            </div>`
      }).join('')

      const badgesHtml = [
        errCount > 0  ? `<span class="issue-badge error">${errCount} err</span>` : '',
        warnCount > 0 ? `<span class="issue-badge warning">${warnCount} warn</span>` : '',
        infoCount > 0 ? `<span class="issue-badge info">${infoCount} info</span>` : '',
      ].join('')

      return `
        <details class="file-section" data-path="${escapeHtml(f.path)}"${hasError ? ' open' : ''}>
          <summary>
            <span class="file-name">${escapeHtml(basename(f.path))}</span>
            <span class="file-path-full">${escapeHtml(f.path)}</span>
            <span class="file-score" style="color:${fColor}">${f.score}/100</span>
            ${badgesHtml}
          </summary>
          <div class="issues-list">${issueRows}
          </div>
        </details>`
    }).join('\n')

  const noIssues = `<div class="empty-state">No issues found. Clean codebase.</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>drift report — ${escapeHtml(projectName)}</title>
  <style>${buildCss()}</style>
</head>
<body>
  <div id="app">

    <!-- Header -->
    <header class="top-header">
      <div class="header-row">
        <div>
          <div class="project-title">${escapeHtml(projectName)}</div>
          <div class="scan-meta">Scanned ${escapeHtml(scanDate)} · drift v${VERSION}</div>
        </div>
      </div>
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-value">${report.totalFiles}</div>
          <div class="stat-label">Total files</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${filesWithIssues}</div>
          <div class="stat-label">Files with issues</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.totalIssues}</div>
          <div class="stat-label">Total issues</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${projColor}">${report.totalScore}</div>
          <div class="stat-label">Score (drift)</div>
        </div>
      </div>
    </header>

    <div class="layout">

      <!-- Sidebar -->
      <aside id="sidebar">

        <!-- Score + Grade -->
        <div class="sidebar-block">
          <div class="sidebar-label">Drift Score</div>
          <div class="score-block">
            <div class="score-number" style="color:${projColor}">${report.totalScore}</div>
            <div class="score-right">
              <div class="score-label" style="color:${projColor}">${projLabel}</div>
              <div class="grade-badge" style="color:${projColor}">${projGrade}</div>
            </div>
          </div>
        </div>

        <!-- Severity filters -->
        <div class="sidebar-block">
          <div class="sidebar-label">Severity</div>
          <div class="sev-check-list">
            <label class="sev-check-item">
              <input type="checkbox" class="severity-filter" value="error" checked />
              <span class="sev-dot" style="background:var(--error)"></span>
              <span style="color:var(--error)">✖ Error</span>
              <span style="color:var(--muted);margin-left:auto;font-size:0.7rem">${report.summary.errors}</span>
            </label>
            <label class="sev-check-item">
              <input type="checkbox" class="severity-filter" value="warning" checked />
              <span class="sev-dot" style="background:var(--warning)"></span>
              <span style="color:var(--warning)">▲ Warning</span>
              <span style="color:var(--muted);margin-left:auto;font-size:0.7rem">${report.summary.warnings}</span>
            </label>
            <label class="sev-check-item">
              <input type="checkbox" class="severity-filter" value="info" checked />
              <span class="sev-dot" style="background:var(--info)"></span>
              <span style="color:var(--info)">◦ Info</span>
              <span style="color:var(--muted);margin-left:auto;font-size:0.7rem">${report.summary.infos}</span>
            </label>
          </div>
        </div>

        <!-- File search -->
        <div class="sidebar-block">
          <div class="sidebar-label">Search files</div>
          <input id="file-search" type="text" placeholder="Filter by filename…" autocomplete="off" />
        </div>

        <!-- Rules list -->
        ${topRules.length > 0 ? `
        <div class="sidebar-block">
          <div class="sidebar-label">Rules (click to filter)</div>
          <div class="rules-list">${ruleItems}
          </div>
        </div>` : ''}

        <!-- Reset -->
        <button id="reset-filters">Reset filters</button>

      </aside>

      <!-- Main -->
      <main id="main">
        <div class="main-header">
          <span id="issue-counter" style="color:var(--muted);font-size:0.75rem">Loading…</span>
        </div>
        ${fileSections || noIssues}
      </main>

    </div><!-- .layout -->

    <footer class="footer">Generated by drift v${VERSION}</footer>

  </div><!-- #app -->

  <script>
    const DRIFT_DATA = ${JSON.stringify(report)};
    ${buildJs()}
  </script>
</body>
</html>`
}
