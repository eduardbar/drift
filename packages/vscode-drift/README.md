# drift — Technical Debt Detector

Detect silent technical debt in TypeScript and JavaScript files, directly in VS Code.

drift analyzes your code with a custom AST engine and shows issues as diagnostics (squiggles) in the editor, in the Problems panel, and in a dedicated sidebar panel — with a score from 0 to 100.

## Features

- **Inline diagnostics** — issues appear as red/yellow squiggles, just like TypeScript errors
- **Problems panel** — all drift issues listed alongside compiler errors
- **Drift Issues panel** — sidebar view with files sorted by score, click any issue to jump to the line
- **Status bar** — `drift 74/100 · 3 issues` always visible, color-coded by severity
- **On-save analysis** — runs automatically when you save a `.ts`, `.tsx`, `.js`, or `.jsx` file
- **Workspace scan** — `Drift: Scan Workspace` command to analyze all files at once

## Rules

| Rule | Severity | What it detects |
|---|---|---|
| `large-file` | error | Files over threshold lines |
| `large-function` | error | Functions over threshold lines |
| `high-complexity` | error | Cyclomatic complexity too high |
| `duplicate-function-name` | error | Same function name in multiple files |
| `debug-leftover` | warning | `console.*` calls and TODO/FIXME markers |
| `catch-swallow` | warning | Empty catch blocks |
| `deep-nesting` | warning | Deeply nested control flow |
| `any-abuse` | warning | Excessive use of `any` |
| `too-many-params` | warning | Functions with too many parameters |
| `dead-code` | warning | Unused imports and variables |
| `high-coupling` | warning | Too many imports in a single file |
| `promise-style-mix` | warning | Mixed Promise and async/await styles |
| `comment-contradiction` | warning | Comments that contradict the code |
| `no-return-type` | info | Missing return type annotations |
| `magic-number` | info | Hardcoded numbers without named constants |

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
```

[github.com/eduardbar/drift](https://github.com/eduardbar/drift)
