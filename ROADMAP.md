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

## What's already done

- AST analysis with ts-morph — 10 detection rules
- Score 0–100 per file and project
- `--json`, `--ai` (LLM-optimized output), `--fix` (inline suggestions)
- `--min-score` for CI (exit 1 if score exceeds threshold)
- `drift-ignore` per line and per file
- Windows / Linux / macOS compatible via `npx`

---

## What's next

Ordered by real developer pain — most common complaint first.

---

### 1. Complexity detection

> *"AI generates a nuclear option for a problem that needed a screwdriver."*  
> — Hacker News

> *"One of my devs implemented a batching process. He presented extremely robust, high-quality code. The problem was that it was MASSIVE overkill."*  
> — Hacker News, r/ExperiencedDevs

ESLint has a `complexity` rule. It measures cyclomatic complexity — the number of branches. That's not the same as cognitive complexity — how hard it is to *understand*. Biome has `noExcessiveCognitiveComplexity`. Neither gives you a score.

**Planned rules:**
- `high-complexity` — cyclomatic complexity > 10 per function
- `deep-nesting` — nesting depth > 3 levels (if inside if inside for inside try = unreadable)
- `too-many-params` — functions with more than 4 parameters (AI doesn't refactor into objects)
- `high-coupling` — files importing more than 10 distinct modules
- `promise-style-mix` — `async/await` and `.then()` mixed in the same file

**Why this matters:** Complexity is the #1 reason codebases become write-only. AI generates correct code. Not simple code.

---

### 2. Cross-file dead code detection

> *"After integrating Knip I removed around 3,500 lines of dead code at once."*  
> — dev.to

> *"ESLint's architecture works on a file-by-file basis and was never intended to provide linting based on project-wide usage stats."*  
> — typescript-eslint issue #371, marked **wontfix**

ESLint detects unused variables *inside a file*. It cannot detect unused exports, unused files, or dead modules across the project. This is a fundamental architectural limitation — not a missing rule.

**Planned features:**
- `unused-export` — exported symbol never imported anywhere in the project
- `dead-file` — file never imported by anything
- `unused-dependency` — package in `package.json` with zero imports in the codebase

**Why this matters:** Dead code is cognitive overhead. Every unused export is a trap for the next developer. ESLint will never fix this — the `wontfix` label is permanent.

---

### 3. Architectural boundary detection

> *"AI coding tools keep breaking architecture — so I built a guard layer."*  
> — Reddit, r/javascript

This is the largest unaddressed gap in the ecosystem. ESLint can validate import paths with `no-restricted-imports`. It cannot tell you if your UI layer is importing directly from your database layer, or if your domain logic has dependencies on your HTTP framework.

**Planned rules:**
- `circular-dependency` — module A depends on B which depends on A
- `layer-violation` — import from a prohibited architectural layer
- `cross-boundary-import` — module outside its domain importing from another domain

Zero config by default — drift infers what it can from the import graph. For teams that want explicit enforcement:

```ts
// drift.config.ts — optional
export default {
  boundaries: {
    layers: ['ui', 'domain', 'infrastructure'],
    rules: [{ from: 'ui', allow: ['domain'] }]
  }
}
```

**Why this matters:** Architecture violations are invisible until they're catastrophic. AI generates code that works today and breaks your architecture silently.

---

### 4. Historical drift (`drift diff` / `drift trend`)

> *"Zero visibility on whether we're actually improving."*  
> — Reddit, r/devsecops

The current score matters. The trend matters more. Is your codebase getting better or worse sprint over sprint? Nobody knows — because no tool measures it in a way that's easy to track.

**Planned commands:**
- `drift diff HEAD~N` — what got worse between two commits
- `drift trend --commits 30` — ASCII chart of score evolution over time  
- `drift blame` — which commits introduced the most debt

No database. No server. Git is the source of truth.

**Why this matters:** A score of 45 means nothing without context. A score that went from 80 to 45 over 4 sprints means your team is actually improving.

---

### 5. AI authorship heuristics

> *"Companies will try to overcome AI-generated technical debt by throwing more AI at the problem."*  
> — Hacker News

> *"When 95% of code is projected to be AI-generated by 2030 but 45% of it fails basic security tests, we're building a house of cards."*  
> — Reddit, r/vibecoding

The hardest and most differentiated item on this list. Patterns that are statistically more common in AI-generated code than human-written code.

**Planned rules:**
- `over-commented` — comments that describe exactly what the code already says (AI documents the obvious)
- `unnecessary-abstraction` — class or interface used in exactly one place (AI loves creating things it doesn't use)
- `hardcoded-config` — strings that look like URLs, tokens, or environment-specific paths hardcoded in logic
- `inconsistent-error-handling` — different error handling patterns in equivalent functions across the same file

**Why this matters:** These patterns don't fail tests. ESLint doesn't catch them. They accumulate until the codebase is unmaintainable.

---

### 6. Static HTML report + README badge

> *"It's all disconnected — different dashboards, zero visibility."*  
> — Reddit, r/devsecops

No server. No account. No cloud.

**Planned features:**
- `drift report` — single self-contained `drift-report.html`, open in any browser
- `drift badge` — `badge.svg` with the current score for your README  
- `drift ci` — GitHub Actions annotations on the exact lines with issues (inline in the PR diff)

---

### 7. ESLint plugin

Meet developers where they already are.

- `eslint-plugin-drift` — exposes drift's rules as standard ESLint rules
- Compatible with ESLint 9 flat config
- The CLI remains canonical — the plugin is an integration path for teams already deep in ESLint

**Why this matters:** Not everyone will install a new CLI. An ESLint plugin removes all friction and puts drift's rules into a toolchain devs already trust.

---

### 8. Pattern inconsistency detection

> *"8x increase in duplicated code blocks with AI tools."*  
> — GitClear

AI doesn't reuse — it regenerates. The same logic appears in 4 different forms across the same file.

**Planned rules:**
- `semantic-duplication` — code blocks with equivalent logic detected via AST fingerprinting (not text comparison — that's what grep does)
- `naming-inconsistency` — mixed naming conventions in the same module (camelCase + snake_case + PascalCase for the same concept)

---

## How to influence this roadmap

Open an issue. If you're seeing a pattern that drift doesn't catch, describe it with a code example. Every rule in drift exists because real developers kept finding the same thing in AI-generated code.

The roadmap grows from community reports — not from assumptions.

If you want to implement one of these, see [CONTRIBUTING.md](./CONTRIBUTING.md).
