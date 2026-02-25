# Roadmap

## What drift is, and what it's trying to become

ESLint tells you if your code is **correct**.  
SonarQube tells you if your code is **complex**.  
drift tells you if your code is **going to kill your codebase in 6 months**.

That is a different problem. And no existing tool solves it.

The gap became critical in 2024–2025. AI tools let two engineers generate the technical debt of fifty. The code compiles. The tests pass. ESLint is green. And six months later nobody understands it, refactoring has stopped, and the codebase is effectively write-only.

> *"You're staring at 847 lines of code you didn't write, don't understand, and can't debug without asking the AI to fix it seventeen times until something sticks."*  
> — Reddit, r/vibecoding

> *"39.9% drop in refactoring activity with AI tools. 8x increase in duplicated code blocks."*  
> — GitClear, analysis of 211M lines of code

drift's goal is to be the tool that sits between ESLint and SonarQube — lightweight enough to run on every commit, specific enough to catch what neither of them can, and simple enough that a score of 0 actually means something.

**What drift is not:**
- Not an ESLint replacement for style or correctness rules
- Not a SonarQube replacement for security scanning
- Not a cloud product, not a SaaS, not freemium

**What drift is:**
- A zero-config static analysis CLI that scores your TypeScript project's structural health
- A CI gate that blocks debt from accumulating silently
- A shared language for teams to talk about code quality: "our drift score went from 40 to 18 this sprint"
- Always free. MIT. No tiers.

---

## Principles that don't change

- **Always free for the developer.** MIT. Forever. No paid tier, no cloud lock-in.
- **Zero config to start.** One command, one number. Config is optional and additive.
- **Fast.** Results in under 3 seconds on any normal project.
- **One actionable number, not 400 warnings nobody reads.**
- **Cross-file analysis.** ESLint sees one file. drift sees the project.
- **Readable by humans and by LLMs.** `--ai` flag produces structured output for Claude, GPT, Gemini.

---

## Completed phases ✅

### Phase 0 — Basic rules `v0.1.0` ✅

Foundation: AST analysis with ts-morph, score 0–100, `--json`, `--ai`, `--fix`, `--min-score`, `drift-ignore` per line and per file, Windows / Linux / macOS compatible via `npx`.

**Rules shipped:**

| Rule | Severity | Weight |
|------|----------|--------|
| `large-file` | error | 20 |
| `large-function` | error | 15 |
| `duplicate-function-name` | error | 18 |
| `debug-leftover` | warning | 10 |
| `dead-code` | warning | 8 |
| `any-abuse` | warning | 8 |
| `catch-swallow` | warning | 10 |
| `no-return-type` | info | 5 |

---

### Phase 1 — Complexity detection `v0.2.0` ✅

ESLint measures cyclomatic complexity per branch. drift measures cognitive load — how hard code is to *understand*. AI generates correct code, not simple code.

**Rules shipped:**

| Rule | Severity | Weight |
|------|----------|--------|
| `high-complexity` | error | 15 |
| `deep-nesting` | warning | 12 |
| `too-many-params` | warning | 8 |
| `high-coupling` | warning | 10 |
| `promise-style-mix` | warning | 7 |
| `magic-number` | info | 3 |
| `comment-contradiction` | warning | 12 |

---

### Phase 2 — Cross-file dead code `v0.3.0` ✅

ESLint detects unused variables inside a file. It cannot detect unused exports, dead files, or dead modules across a project — this is a fundamental architectural limitation (typescript-eslint issue #371, marked `wontfix`). drift builds a full import graph.

**Rules shipped:**

| Rule | Severity | What it detects |
|------|----------|-----------------|
| `unused-export` | warning | Exported symbol never imported anywhere in the project |
| `dead-file` | warning | File never imported by anything |
| `unused-dependency` | warning | Package in `package.json` with zero imports in the codebase |

---

### Phase 3 — Architectural boundaries `v0.4.0` ✅

Architecture violations are invisible until they're catastrophic. ESLint can validate import paths with `no-restricted-imports`. It cannot tell you if your UI layer is importing directly from your database layer, or if your domain logic has dependencies on your HTTP framework. AI generates code that works today and breaks your architecture silently.

**Rules shipped:**

| Rule | Severity | What it detects |
|------|----------|-----------------|
| `circular-dependency` | error | Module A depends on B which depends on A |
| `layer-violation` | error | Import from a prohibited architectural layer |
| `cross-boundary-import` | warning | Module outside its domain importing from another domain |

---

### Phase 5 — AI authorship heuristics `v0.6.0` ✅

Patterns that are statistically more common in AI-generated code than human-written code. These don't fail tests. ESLint doesn't catch them. They accumulate until the codebase is unmaintainable.

**Rules shipped:**

| Rule | Severity | What it detects |
|------|----------|-----------------|
| `hardcoded-config` | warning | URLs, tokens, or env-specific paths hardcoded in logic |
| `inconsistent-error-handling` | warning | Different error handling patterns in equivalent functions |
| `unnecessary-abstraction` | warning | Class or interface used in exactly one place |
| `naming-inconsistency` | warning | Mixed naming conventions in the same module |
| `over-commented` | info | Comments that describe exactly what the code already says |

---

### Phase 8 — Semantic duplication `v0.7.0` ✅

AI doesn't reuse — it regenerates. The same logic appears in 4 different forms across the same file. Text-comparison is what grep does. drift uses AST fingerprinting for Type-2 clone detection: structurally equivalent code regardless of variable names.

**Rules shipped:**

| Rule | Severity | What it detects |
|------|----------|-----------------|
| `semantic-duplication` | warning | Code blocks with equivalent logic via AST fingerprinting |

---

### Phase 4 — Historical analysis `v0.9.0` ✅

A score of 45 means nothing without context. A score that went from 80 to 45 over 4 sprints means your team is actually improving. No database. No server. Git is the source of truth.

**Commands shipped:**
- `drift trend` — linear regression over project history with uniform sampling of 10 points
- `drift blame` — debt attribution by author via git blame

**v0.9.1 fix:** Full project snapshot per commit, uniform 10-point sampling for consistent trend lines.

---

## Current state — February 2026

- **26 rules active** across 9 detection categories
- **Self-scan score: 14/100 (LOW)**
- Published on npm as `@eduardbar/drift` — MIT, always free
- Cross-platform: Windows / Linux / macOS via `npx`

---

## Path to v1.0.0

The following items are required before calling this v1.0.0.

---

### Unit test suite

**Status:** pending  
**Target:** vitest suite covering all 26 rules

Every rule needs at minimum: one test with a fixture that triggers the rule, one test with a fixture that doesn't. No rule ships without a test from v1.0.0 onward.

---

### Modular refactor

**Status:** pending  
**Target:** split `analyzer.ts` (currently ~1995 lines) into `src/rules/*` and `src/git/*`

One file per rule. The monolithic analyzer is unsustainable as a contribution surface and a maintenance liability. This is a blocker for external contributors.

```
src/
├── rules/
│   ├── large-file.ts
│   ├── large-function.ts
│   ├── high-complexity.ts
│   └── ...
├── git/
│   ├── trend.ts
│   └── blame.ts
├── analyzer.ts   ← orchestrator only, no rule logic
└── ...
```

---

### JavaScript / JSX support

**Status:** pending  
**Target:** ts-morph can parse JS — extend scan to `.js` and `.jsx` files

TypeScript-only limits the addressable market. JS projects have the same debt patterns. Zero new rules required — same detection, wider reach.

---

### VS Code extension

**Status:** pending  
**Target:** extension that shows inline warnings directly in the editor

The CLI is the canonical tool. The extension is an integration path for developers who want drift's signal without leaving their editor. Inline decorations for errors, warnings, inline fix suggestions on hover.

---

### `drift fix` — automated corrections

**Status:** pending  
**Target:** automatic application of simple fixes for low-effort rules

Starting scope: `debug-leftover` (remove console statements), `magic-number` (extract to named constant). No AST rewriting for complex rules — only deterministic single-line fixes.

---

### Interactive HTML report

**Status:** pending  
**Target:** `drift report` command generates a self-contained `drift-report.html`

No server. No account. Open in any browser. Filterable by rule, severity, and file. Shareable as a single file artifact in CI.

---

## v1.0.0 milestone

v1.0.0 ships when **all of the following are true:**

1. **All 26 rules have unit tests** — vitest suite passes with zero failures
2. **`analyzer.ts` is split** — `src/rules/*` structure in place, one file per rule
3. **JS/JSX support is live** — `.js` and `.jsx` files are analyzed with the same ruleset
4. **`drift fix` is live** — at minimum `debug-leftover` and `magic-number` auto-fix
5. **Interactive HTML report is live** — `drift report` produces a working `drift-report.html`
6. **Self-scan score stays ≤ 20** — drift eats its own dog food before calling itself v1.0.0

Items not required for v1.0.0: VS Code extension (post-1.0 roadmap), ESLint plugin (post-1.0 roadmap).

---

## How to influence this roadmap

Open an issue. If you're seeing a pattern that drift doesn't catch, describe it with a code example. Every rule in drift exists because real developers kept finding the same thing in AI-generated code.

The roadmap grows from community reports — not from assumptions.

If you want to implement one of these, see [CONTRIBUTING.md](./CONTRIBUTING.md).
