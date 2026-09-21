# drift — Technical Debt Detector

[![Version](https://img.shields.io/visual-studio-marketplace/v/eduardbar.vscode-drift?color=6366f1&label=version)](https://marketplace.visualstudio.com/items?itemName=eduardbar.vscode-drift)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/eduardbar.vscode-drift?color=8b5cf6&label=installs)](https://marketplace.visualstudio.com/items?itemName=eduardbar.vscode-drift)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/eduardbar.vscode-drift?color=6366f1)](https://marketplace.visualstudio.com/items?itemName=eduardbar.vscode-drift)
[![License: MIT](https://img.shields.io/badge/license-MIT-94a3b8)](https://github.com/eduardbar/drift/blob/master/LICENSE)

Detect structural technical debt in TypeScript and JavaScript, directly in VS Code. drift uses the shared AST analysis engine to score files from **0 to 100** and surface issues as inline diagnostics, with no extension config required.

The extension is the editor entry point for the [Drift CLI](https://github.com/eduardbar/drift). See the [canonical rules catalog](https://github.com/eduardbar/drift/blob/master/docs/rules-catalog.md) for the current rule set and the [full CLI documentation](https://github.com/eduardbar/drift#commands) for CI, reports, trust gates, and MCP.

## Features

- **Inline diagnostics** — issues appear as red/yellow squiggles, just like TypeScript errors
- **Problems panel** — all drift issues listed alongside compiler errors
- **Drift Issues panel** — sidebar TreeView with files sorted by score, click any issue to jump to the line
- **Status bar** — `drift 74/100 · 3 issues` always visible, color-coded by severity
- **On-save analysis** — runs automatically when you save a `.ts`, `.tsx`, `.js`, or `.jsx` file
- **Workspace scan** — `Drift: Scan Workspace` command to analyze all files at once

## Analysis coverage

The extension surfaces the current shared engine findings in the Problems panel and Drift Issues view. Coverage includes file and function size, complexity, dead code, dependency coupling, nesting, unsafe leftovers, type-safety patterns, and configured architecture boundaries. Severity is assigned by the engine and may change as the canonical rules catalog evolves.

For the complete, versioned list of rule IDs and descriptions, see the [canonical rules catalog](https://github.com/eduardbar/drift/blob/master/docs/rules-catalog.md).

## Commands

| Command | Description |
|---|---|
| `Drift: Scan Workspace` | Analyze all TS/JS files in the workspace |
| `Drift: Clear Diagnostics` | Remove all drift diagnostics |

## Settings

| Setting | Default | Description |
|---|---|---|
| `drift.enable` | `true` | Enable automatic analysis on save |
| `drift.minSeverity` | `"info"` | Minimum severity to show (`error`, `warning`, `info`) |

## CLI

drift also ships as a standalone CLI with HTML reports, CI integration, git blame, and trend analysis.

```
npm install -g @eduardbar/drift
drift scan .
drift fix . --write
drift report .
```

[![GitHub](https://img.shields.io/badge/github-eduardbar%2Fdrift-6366f1)](https://github.com/eduardbar/drift)
