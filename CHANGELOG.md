# Changelog

All notable changes to drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.1] — 2026-02-25

### Fixed
- `drift trend`: `analyzeSingleCommit` now analyses the full project snapshot at each commit instead of only the files changed in the diff. Uses `git ls-tree -r <hash> --name-only` to enumerate all tracked `.ts/.tsx` files, writes them to a temp directory via `git show <hash>:<file>`, runs `analyzeProject` on the snapshot, then cleans up. Score in each `TrendDataPoint` now reflects the total project health, not just the files touched in that commit.
- `drift trend`: added sampling to `analyzeHistoricalCommits` — selects at most 10 commits distributed evenly across the period (configurable via `maxSamples`). Prevents timeouts on repos with 100+ commits.
- `drift trend` / `drift blame`: propagate `DriftConfig` through the full call chain (`analyzeTrend` → `analyzeHistoricalCommits` → `analyzeSingleCommit` → `analyzeProject`) so custom rule configs are respected in historical analysis.

---

## [Unreleased]

### Added
- Local AI integration commands: `context`, `mcp`, and `ai-guard`, including bounded built-package smoke coverage and OpenCode stdio configuration guidance.

---

## [1.5.0] - 2026-03-26

### Changed

- CI drift version policy now uses `package.json` as source of truth, aligns action defaults/docs to `1.5.0`, and adds a test guard that fails if action/workflow references drift semver values that diverge.
- Reusable quality checks now include a required CLI smoke E2E gate (`npm run smoke:repo`) for merge/release verification and upload smoke artifacts (`.drift-smoke/...`) for CI failure triage.
- Runtime support policy is now enforced as Node.js `20.x` and `22.x` (LTS): `package.json` now declares `engines.node`, CI matrix moved to `20/22`, and docs/doctor output were aligned to avoid advertising unsupported Node versions.
- Added runtime policy gate (`npm run check:runtime-policy`) in required CI checks to fail fast when `engines.node`, workflow matrix, README runtime line, or lockfile dependency constraints diverge.
- Tradeoff: dropped Node 18 from required support because `commander@14` (runtime dependency) requires Node `>=20`; preserving `18/20/22` would create false support claims and non-deterministic install/runtime behavior.
- `drift doctor --json` and `drift guard --json` now emit schema metadata (`$schema`, `toolVersion`) and are covered by v1 schema contract tests (`schemas/drift-doctor.v1.json`, `schemas/drift-guard.v1.json`).
- Added performance regression gate (`npm run check:perf-budget`) with versioned budgets in `benchmarks/perf-budget.v1.json`, benchmark memory/runtime contract checks, and CI artifact upload under `.drift-perf/` (gated on Node 20 to reduce matrix flakiness).
- Stabilized local/CI test reliability by setting global Vitest default timeouts (15s) and tuning the scan runtime perf budget threshold for lower false-positive noise.

---

## [1.4.0] - 2026-03-18

### Added

- `drift init`: project scaffolding command for `drift.config.ts`, optional CI workflow, and baseline generation.
- `drift doctor`: environment and project diagnostics command with optional JSON output.
- `drift guard [path]`: non-regression gate command for diff-aware (`--base`) or baseline-aware (`--baseline`) quality checks.
- Output schema contracts and metadata for machine-consumable outputs (v1 JSON schemas).
- SARIF mapper/public API and SARIF output support for `scan`, `ci`, `diff`, `review`, and `trust`.
- CI integration update for SARIF publishing in pull request workflows and action v2 contract alignment.

### Changed

- Unified CLI output format handling around `--format` with legacy alias compatibility (`--json`, `--ai`, `--comment`, `--markdown`).
- `docs/rules-catalog.md` and command format matrix updated to reflect current SARIF-capable commands and 35-rule catalog.

### Tests

- Added and expanded coverage for init/doctor/guard flows and SARIF paths (`tests/phase1-init-doctor-guard.test.ts`, `tests/cli-sarif.test.ts`, `tests/sarif.test.ts`, `tests/format.test.ts`).

### Docs

- Updated trust-core and release-oriented docs to match current CLI behavior, trust artifacts, and SARIF workflow expectations.

---

## [0.9.0] - 2026-02-24

### Added

- **Phase 4: Historical drift analysis**
  - `drift trend [path]` — `TrendAnalyzer` reads git log and computes drift score per commit over time; outputs a score-over-time table and detects score regressions across the project history
  - `drift blame [path]` — `BlameAnalyzer` maps each detected issue to the git commit and author that introduced it using `git blame`; output includes author, commit hash, date, and issue description per line
- **Phase 6: Static HTML report + README badge + CI annotations**
  - `drift report [path]` — generates a self-contained `drift-report.html` with score, per-file breakdown, collapsible issue list, and fix suggestions
  - `drift badge [path]` — generates a `badge.svg` with the current drift score for embedding in a README
  - `drift ci [path]` — emits GitHub Actions workflow annotations inline on PR diffs and writes a step summary; supports `--min-score` to gate PRs

### Fixed

- `VERSION` is now read dynamically from `package.json` at runtime — no longer hardcoded as a string constant in `cli.ts`
- Added missing `program.parse()` call in `cli.ts` — subcommands (`scan`, `diff`, `trend`, `blame`, `report`, `badge`, `ci`) were registered but never executed when the CLI was invoked

---

## [0.8.0] - 2026-02-24

### Added
- `semantic-duplication` rule — Type-2 AST clone detection via SHA-256 fingerprinting
- Normalizes parameter names, local variable names, and literals before hashing — detects identical logic with different variable names
- Runs cross-file across the entire project; reports each duplicate pointing to all other locations
- Minimum threshold: functions with ≥ 8 body lines (reduces noise from trivial helpers)
- Skips test framework helpers (describe, it, test, beforeEach, afterEach)
- RULE_WEIGHTS entry: severity `warning`, weight `12`

---

## [0.7.0] - 2026-02-24

### Added
- `eslint-plugin-drift` — separate npm package exposing all 26 drift rules as ESLint 9 flat config rules
- Each rule wraps drift's AST engine via `analyzeFile()` with a shared ts-morph `Project` instance
- Per-file result cache (max 100 entries) to prevent redundant analysis in watch mode
- `recommended` config array enabling all 26 rules at their canonical drift severity

---

## [0.5.0] — 2026-02-24

### Added

- **Phase 5: AI authorship heuristics** — 5 new rules that detect patterns AI code generators produce
  - `over-commented` (info, weight 4): functions where comment density ≥ 40% — AI over-documents the obvious
  - `hardcoded-config` (warning, weight 10): hardcoded URLs, IPs, or connection strings instead of env vars
  - `inconsistent-error-handling` (warning, weight 8): mixed `try/catch` and `.catch()` patterns in the same file
  - `unnecessary-abstraction` (warning, weight 7): single-method interfaces or abstract classes never reused
  - `naming-inconsistency` (warning, weight 6): mixed camelCase and snake_case identifiers in the same scope

---

## [0.4.0] — 2026-02-23

### Added
- **Phase 2: cross-file dead code detection** — three new rules that require project-level import graph analysis (ESLint cannot do this by design — issue wontfix #371):
  - `unused-export` (warning, weight 8): named exports that are never imported anywhere in the project.
  - `dead-file` (warning, weight 10): source files that are never imported by any other file.
  - `unused-dependency` (warning, weight 6): packages listed in `dependencies` in `package.json` that are never imported in source code.
- `analyzeProject()` now builds a cross-file import graph before per-file analysis, enabling project-level rules without additional dependencies.
- Fix suggestions for all three new rules in `src/printer.ts`.
- **Phase 3: structural architecture analysis**:
  - `circular-dependency` (error, weight 14): detects circular import chains using DFS cycle detection. Reports the full cycle path as `A → B → C → A`.
  - `layer-violation` (error, weight 16): flags imports that violate declared architectural layers. Requires `drift.config.ts`.
  - `cross-boundary-import` (warning, weight 10): flags imports across module boundaries outside allowed paths. Requires `drift.config.ts`.
- `loadConfig()` — new async config loader in `src/config.ts`. Discovers `drift.config.ts / .js / .json` at project root. All rules except `layer-violation` and `cross-boundary-import` work without any config.
- `DriftConfig`, `LayerDefinition`, `ModuleBoundary` types exported from the package.
- Fix suggestions for all Phase 3 rules in `src/printer.ts`.
- **Phase 4: `drift diff` — historical comparison**:
  - `drift diff [ref]` command: compare current project state against any git ref (commit, branch, tag). Default ref: `HEAD~1`.
  - Uses `git show <ref>:<file>` for non-destructive extraction — no checkout, no stash, no repo state changes.
  - Detects new issues introduced and issues resolved per file.
  - Shows score delta per file and overall (`+N` red = regression, `-N` green = improvement).
  - `--json` flag outputs raw `DriftDiff` JSON for CI consumption.
  - New types `DriftDiff` and `FileDiff` exported from the package.
  - New `computeDiff()` function exported for programmatic use.

---

## [0.3.0]

### Added
- `--ai` flag: outputs LLM-optimized JSON (`AIOutput`) designed to be pasted directly into Claude, GPT, or any other model as context. Issues are ranked by severity and effort — quick wins first. Each issue includes `fix_suggestion` and `effort` level. The output includes `recommended_action` generated from the scan.
- `--fix` flag: shows inline fix suggestions in the console for each detected issue, rendered as a visual diff block.

### Changed
- `formatAIOutput()` added to `reporter.ts` — produces the `AIOutput` structure with `summary`, `priority_order`, and `context_for_ai`.

---

## [0.2.3]

### Fixed
- `npx @eduardbar/drift` now works correctly on Windows. The issue was that Node.js on Windows does not execute the shebang (`#!/usr/bin/env node`) in ES module `.js` files reliably. Added `bin/drift.js` as a thin wrapper with a dynamic `import()` that works cross-platform.

---

## [0.2.2]

### Fixed
- CI workflow was triggering a double publish on the same release. Removed the duplicate `push: tags` trigger — now uses only `release: published`. Added a guard step that checks `npm view @eduardbar/drift@$VERSION` before publishing to skip if already published.

### Refactored
- `formatMarkdown()` in `reporter.ts` split into smaller helper functions for readability.

---

## [0.2.1]

### Added
- `drift-ignore` comment support: add `// drift-ignore` on a line (or the line above it) to suppress that specific issue.
- `drift-ignore-file` comment support: add `// drift-ignore-file` in the first 10 lines of a file to exclude the entire file from analysis. Used in `printer.ts` itself — its `console.log` calls are intentional CLI output, not debug leftovers.

### Fixed
- drift was reporting issues in its own `printer.ts` when run on itself. Fixed by adding `// drift-ignore-file` to that file.

---

## [0.2.0]

### Added
- ASCII score bar in console output (`█████████████░░░░░░░ 67/100`).
- Executive summary header with total file count, error/warning/info counts, and top issues.
- File count shown after scan completes.
- `scoreToGrade`, `severityIcon`, and `scoreBar` extracted to `src/utils.ts` — shared between printer and reporter.

### Changed
- Console output restructured with cleaner visual hierarchy.

---

## [0.1.0]

### Added
- Initial release.
- AST analysis engine using ts-morph.
- 8 detection rules: `large-file`, `large-function`, `debug-leftover`, `dead-code`, `duplicate-function-name`, `any-abuse`, `catch-swallow`, `no-return-type`.
- Score 0–100 per file and per project (average).
- Console printer with color output using kleur.
- Markdown reporter (`--output`).
- Raw JSON output (`--json`).
- CI integration via `--min-score` (exit code 1 if score exceeds threshold).
- CLI entry point with Commander.js.
- GitHub Actions workflow for automated npm publish on release.
