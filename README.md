![drift — vibe coding debt detector](./assets/og.svg)

# drift

Detect silent technical debt left by AI-generated code. One command. Zero config.

_Vibe coding ships fast. drift tells you what it left behind._

![npm](https://img.shields.io/npm/v/@eduardbar/drift?color=6366f1&label=npm)
![license](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)
![ts-morph](https://img.shields.io/badge/powered%20by-ts--morph-6366f1.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

[Installation](#-installation) • [Usage](#-usage) • [Rules](#-what-it-detects) • [CI Integration](#-ci-integration) • [Score](#-score) • [Contributing](#-contributing)

---

## 🎯 Why?

You reviewed the AI-generated code today. Huge files, unused functions, empty catch blocks, duplicate helpers, `console.log` everywhere. It ran fine in dev. It will bite you in prod.

drift scans your TypeScript/JavaScript codebase for the specific patterns AI tools leave behind and gives you a score so you know where to look first.

```bash
$ npx @eduardbar/drift scan ./src

  drift  —  vibe coding debt detector
  ──────────────────────────────────────────────────

  Score   █████████████░░░░░░░  67/100  HIGH
  4 file(s) with issues  ·  5 errors  ·  12 warnings  ·  3 info  ·  18 files clean

  Top issues:  debug-leftover ×8  ·  any-abuse ×5  ·  no-return-type ×3

  ──────────────────────────────────────────────────

  src/api/users.ts (score 85/100)
    ✖ L1    large-file              File has 412 lines (threshold: 300)
    ▲ L34   debug-leftover          console.log left in production code
    ▲ L89   catch-swallow           Empty catch block silently swallows errors
    ▲ L201  any-abuse               Explicit 'any' type detected

  src/utils/helpers.ts (score 70/100)
    ✖ L12   duplicate-function-name 'formatDate' looks like a duplicate
    ▲ L55   dead-code               Unused import 'debounce'
```

---

## 📦 Installation

```bash
# Run without installing
npx @eduardbar/drift scan ./src

# Install globally
npm install -g @eduardbar/drift
drift scan ./src

# Install as dev dependency
npm install --save-dev @eduardbar/drift
```

---

## 🚀 Usage

```bash
# Recommended — no install needed
npx @eduardbar/drift scan .
npx @eduardbar/drift scan ./src
npx @eduardbar/drift scan ./src --output report.md
npx @eduardbar/drift scan ./src --json
npx @eduardbar/drift scan ./src --ai
npx @eduardbar/drift scan ./src --fix
npx @eduardbar/drift scan ./src --min-score 50

# Install globally if you want the short 'drift' command
npm install -g @eduardbar/drift
drift scan .
```

### Options

| Flag | Description |
|------|-------------|
| `--output <file>` | Write Markdown report to a file |
| `--json` | Output raw JSON instead of console output |
| `--ai` | Output AI-optimized JSON for LLM consumption (Claude, GPT, etc.) |
| `--fix` | Show fix suggestions for each detected issue |
| `--min-score <n>` | Exit with code 1 if overall score exceeds threshold |

### AI Integration

Use `--ai` to get structured output that LLMs can consume:

```bash
npx @eduardbar/drift scan ./src --ai
```

Output includes:
- Priority-ordered issues (by severity and effort)
- Fix suggestions for each issue
- Recommended action for quick wins

Use `--fix` to see concrete fix suggestions in terminal:

```bash
npx @eduardbar/drift scan ./src --fix
```

---

## 🔍 What it detects

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `large-file` | error | Files over 300 lines — AI dumps everything into one place |
| `large-function` | error | Functions over 50 lines — AI avoids splitting logic |
| `debug-leftover` | warning | `console.log`, `TODO`, `FIXME`, `HACK` comments |
| `dead-code` | warning | Unused imports — AI imports more than it uses |
| `duplicate-function-name` | error | Near-identical function names — AI regenerates instead of reusing |
| `any-abuse` | warning | Explicit `any` type — AI defaults to `any` when it can't infer |
| `catch-swallow` | warning | Empty catch blocks — AI makes code "not throw" |
| `no-return-type` | info | Missing explicit return types on functions |

---

## ⚙️ CI Integration

Drop this into your GitHub Actions workflow to block merges when drift exceeds your threshold:

```yaml
- name: Check for vibe coding drift
  run: npx @eduardbar/drift scan ./src --min-score 60
```

Exit code `1` if score exceeds `--min-score`. Exit code `0` otherwise.

---

## 📊 Score

| Score | Grade | Meaning |
|-------|-------|---------|
| 0 | CLEAN | No issues found |
| 1–19 | LOW | Minor issues, safe to ship |
| 20–44 | MODERATE | Worth a review before merging |
| 45–69 | HIGH | Significant structural debt detected |
| 70–100 | CRITICAL | Review before this goes anywhere near production |

---

## 🗂️ Project structure

```
src/
├── types.ts      — DriftIssue, FileReport, DriftReport interfaces
├── analyzer.ts   — AST analysis with ts-morph, 8 detection rules
├── reporter.ts   — buildReport() + Markdown formatter
├── printer.ts    — Console output with color (kleur)
├── index.ts      — Public API re-exports
└── cli.ts        — CLI entry point (Commander.js)
```

---

## 🧪 Run on yourself

drift passes its own scan with a MODERATE score — the `console.log` calls in `printer.ts` are intentional CLI output, not debug leftovers. We eat our own dog food.

```bash
git clone https://github.com/eduardbar/drift
cd drift
npm install
npm run build
node dist/cli.js scan ./src
```

Or without cloning:

```bash
npx @eduardbar/drift scan .
```

---

## 🤝 Contributing

PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Adding a new detection rule:**

1. Fork the repo and create a branch: `git checkout -b feat/rule-name`
2. Add the rule weight to `RULE_WEIGHTS` in `src/analyzer.ts`
3. Implement the AST detection logic using ts-morph
4. Add a `fix_suggestion` for the rule in `src/printer.ts`
5. Update the rules table in `README.md` and `AGENTS.md`
6. Open a PR — use the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

Before opening an issue, check [existing issues](https://github.com/eduardbar/drift/issues). Use the [bug report](./.github/ISSUE_TEMPLATE/bug_report.md) or [feature request](./.github/ISSUE_TEMPLATE/feature_request.md) templates.

Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

---

## 🧱 Stack

TypeScript · ts-morph · commander · kleur

---

## 📄 License

MIT © [eduardbar](https://github.com/eduardbar)

---

_Built with mate by a developer who got tired of reviewing the same AI-generated patterns every week._
