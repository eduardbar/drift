# Roadmap

This is where drift is going. Everything here comes from real pain — Reddit threads, Hacker News discussions, GitHub issues, and devs building ad-hoc tools to fill gaps that nothing else covers.

**Principles that don't change:**
- Always free for the developer. MIT. No tiers.
- Zero config to start — one command, one number.
- Fast — results in under 3 seconds on any normal project.
- One actionable number, not 400 warnings nobody reads.
- Readable by humans and by LLMs.

---

## What's already done

- AST analysis with ts-morph — 10 detection rules
- Score 0–100 per file and project
- `--json`, `--ai` (LLM-optimized output), `--fix` (inline suggestions)
- `--min-score` for CI (exit 1 if score exceeds threshold)
- `drift-ignore` per line and per file
- Windows / Linux / macOS compatible
- `npx` zero config

---

## What's next

These aren't ordered by date — they're ordered by impact. The most painful gaps first.

### Complexity detection

> *"AI generates correct code but 10x more complex than needed."*
> — Hacker News, 2025

ESLint checks if your code is correct. It doesn't measure how hard it is to understand.

- **`high-complexity`** — cyclomatic complexity > 10 per function
- **`deep-nesting`** — nesting depth > 3 levels
- **`too-many-params`** — functions with more than 4 parameters
- **`high-coupling`** — modules importing more than 10 distinct dependencies
- **`promise-style-mix`** — `async/await` and `.then()` mixed in the same file

---

### Historical drift (`drift diff` / `drift trend`)

> *"Zero visibility on whether we're actually improving."*
> — Reddit r/devsecops

> *"39.9% drop in refactoring activity with AI tools."*
> — GitClear, analysis of 211M lines of code

The current state of the score matters. The trend matters more.

- **`drift diff HEAD~N`** — show what got worse between two commits
- **`drift trend --commits 30`** — ASCII chart of score evolution over time
- **`drift blame`** — which commits added the most debt

No database. No server. Git is the source of truth.

---

### Architectural boundary detection

> *"AI coding tools keep breaking architecture — so I built a guard layer."*
> — Reddit r/javascript (a developer built this ad-hoc, confirming the gap exists)

This is the largest unaddressed gap in the current tooling landscape. ESLint can validate import paths. It can't tell you if your UI layer is importing directly from your database layer.

- **`circular-dependency`** — module A depends on B which depends on A
- **`layer-violation`** — import from a prohibited layer (configurable, zero config by default)
- **`cross-boundary-import`** — module outside its domain importing from another domain

Optional config for teams that want explicit rules:
```ts
// drift.config.ts — only needed if you want architectural rules
export default {
  boundaries: {
    layers: ['ui', 'domain', 'infrastructure'],
    rules: [{ from: 'ui', allow: ['domain'] }]
  }
}
```

Without config, drift infers what it can from the import graph.

---

### Pattern inconsistency detection

> *"8x increase in duplicated code blocks with AI tools."*
> — GitClear

AI doesn't reuse — it regenerates. The same pattern appears in 6 different forms across the same codebase.

- **`semantic-duplication`** — code blocks with equivalent logic detected via AST fingerprinting (not text comparison)
- **`naming-inconsistency`** — mixed naming conventions in the same scope

---

### Static HTML report + README badge

> *"It's all disconnected — different dashboards, zero visibility."*
> — Reddit r/devsecops

No server. No account. No cloud.

- **`drift report`** — generates a single self-contained `drift-report.html` file, open in any browser
- **`drift badge`** — generates a `badge.svg` with the current score for your README
- **`drift ci`** — structured output with GitHub Actions annotations on the exact lines

---

### ESLint plugin

Meet developers where they already are.

- **`eslint-plugin-drift`** — exposes drift's rules as standard ESLint rules, configurable as `error` or `warn`
- Compatible with ESLint 9 flat config
- The CLI remains the canonical way to use drift — the plugin is an integration path for teams already deep in ESLint

---

### AI authorship heuristics

> *"No one in the company knows how to deal with it other than throwing more tokens at it."*
> — Hacker News

The hardest and most differentiated thing on this list. Detect patterns that are statistically more common in AI-generated code than human-written code.

- **`over-commented`** — comments that describe exactly what the code already says
- **`unnecessary-abstraction`** — class or interface used in exactly one place
- **`hardcoded-config`** — strings that look like URLs, tokens, or paths hardcoded in logic

---

## How to influence this roadmap

Open an issue. If you're seeing a pattern that drift doesn't catch, describe it with a code example and we'll add it. The rules in drift exist because real developers kept finding the same thing in AI-generated code.

The roadmap grows from what the community reports — not from assumptions.
