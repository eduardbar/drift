# Drift Guardian — Implementation Plan

**Status:** Draft v1 — chronological phases. Phase 0–2 are the current work unit.

---

## Phase 0 — Repository analysis

**Objective:** Map existing drift capabilities to reuse; identify seams (diff parsing, git
readers, SARIF, config loading, CLI registration, MCP registry, composite actions). No code
changes.

**Files:** `src/git.ts`, `src/ai-guard-diff.ts`, `src/ai-guard-runner.ts`, `src/sarif.ts`,
`src/config.ts`, `src/types/*`, `src/cli.ts`, `src/mcp-server.ts`, `.github/actions/drift-scan`,
`vitest.config.ts`, `scripts/build.mjs`.

**Interfaces:** (read-only) — reuse map in `docs/guardian/TRD.md §5`.

**Tests:** none required; findings recorded in TRD.

**Acceptance criteria:**
- Reuse map complete and accurate (verified against source).
- No duplication decisions left open.

**Risks:** naming collisions (`Guardian*` vs existing); mitigated by explicit namespace.

**Dependencies:** none.

---

## Phase 1 — Guardian domain model ✅ *(this work unit)*

**Objective:** Define the typed domain model and initial interfaces in `src/guardian/types.ts`
+ barrel `src/guardian/index.ts`, exported through the library surface.

**Files:**
- `src/guardian/types.ts` — `GuardianSeverity`, `GuardianFinding`, `GuardianFindingCategory`,
  `GuardianLocation`, `GuardianRule`, `GuardianPolicy`, `GuardianChange`, `GuardianContext`,
  `GuardianVerdict`, `GuardianResult`, `AIReview`, `AIReviewProvider`, config types
  (`GuardianConfig`, `GuardianArchitectureRule`, `GuardianForbiddenDependency`,
  `GuardianProtectedPath`, `GuardianAiConfig`, `GuardianExitConfig`).
- `src/guardian/index.ts` — barrel.
- `src/types.ts` — add `guardian` export block.
- `src/index.ts` — export Guardian public API.
- `package.json` — add `dist/guardian/*` to `files` (publish surface).

**Interfaces:** all in TRD §3; config schema in TRD §4.

**Tests:** `tests/guardian-domain.test.ts` — compile-time shape assertions, severity ordering,
default config factory, deterministic finding id helper, verdict derivation from findings +
exit config (pure functions used by Phase 3/6).

**Acceptance criteria:**
- Domain types compile under strict TS.
- Barrel + library exports resolve.
- No changes to existing public APIs (additive only).
- Test suite green.

**Risks:** schema drift between `drift.config.ts` and `drift.guard.yml`; mitigated by keeping
Guardian types independent and mapping at context assembly (Phase 3).

**Dependencies:** Phase 0.

---

## Phase 2 — Git change collector ✅ *(this work unit)*

**Objective:** `src/guardian/change-collector.ts` — turn any diff source into
`GuardianChange[]` with per-file stats, reusing `parseUnifiedDiff` and git readers.

**Files:**
- `src/guardian/change-collector.ts`
- `src/guardian/index.ts` (export)
- `tests/guardian-change-collector.test.ts`

**Interfaces:**

```ts
export function collectChanges(
  projectPath: string,
  source: DiffSource,
  options?: { includeHunks?: boolean },
): GuardianChange[]

export function collectWorkingTreeChanges(projectPath: string): GuardianChange[]
export function changesFromDiff(diff: string): GuardianChange[]
export function affectedFiles(changes: GuardianChange[]): string[]
export function readWorkingTreeDiff(projectPath: string): string
```

**Tests (temp real git repos, pattern from `tests/git.test.ts`):**
- modified / added / deleted / rename entries → correct status, paths, line stats.
- line counts from hunks (additions, deletions, changedLines).
- working-tree collection includes staged + unstaged vs HEAD.
- base ref collection (tag) matches expectations.
- external diff text (stdin-like) parses; malformed diff throws.
- empty diff → empty array (no throw).
- binary entries excluded from line stats but present as `binary`.
- non-repo path throws "Not a git repository".
- path traversal in diff text rejected (delegated to `parseUnifiedDiff`, asserted end-to-end).

**Acceptance criteria:**
- Collector returns deterministic, normalized output for all statuses.
- Zero writes to the repo; read-only git.
- Full test suite green.

**Risks:** rename-with-hunks edge cases; covered by reusing the hardened parser and asserting
in tests. Windows path normalization; asserted via `/`-separated outputs.

**Dependencies:** Phase 1.

---

## Phase 3 — Policy engine + context assembly

**Objective:** `src/guardian/engine.ts`, `src/guardian/context.ts`, `src/guardian/config/`.
Resolve config → `GuardianPolicy` → evaluate rules against `GuardianContext`.

**Files:** `engine.ts`, `context.ts`, `config/loader.ts`, `config/validator.ts`,
`config/index.ts`, `schemas/guardian-config.v1.json`, `tests/guardian-engine.test.ts`,
`tests/guardian-config.test.ts`.

**Interfaces:**

```ts
export interface GuardianEngine {
  evaluate(context: GuardianContext, policy: GuardianPolicy): GuardianFinding[]
}
export function buildPolicy(config: GuardianConfig): GuardianPolicy
export function loadGuardianConfig(projectRoot: string): Promise<GuardianConfig | undefined>
```

**Tests:** config loading (json/ts; yml deferred), validation errors, engine rule dispatch,
severity resolution, policy build, context assembly mapping drift layers/modules.

**Acceptance criteria:** config → policy → findings pipeline works for unit-level rule stubs.

**Risks:** `.yml` parsing — decide: add `yaml` dependency vs JSON/TS-only MVP. Default: keep
zero new deps; `.yml` loader behind a documented adapter that Phase 3 implements with the
`yaml` package **or** documents the subset. See also TRD §4.2.

**Dependencies:** Phase 1, 2.

---

## Phase 4 — Initial architectural rules

**Objective:** first deterministic rule sets under `src/guardian/rules/`.

**Files:** `rules/architecture.ts`, `rules/dependencies.ts`, `rules/protected-paths.ts`,
`rules/api-change.ts`, `rules/index.ts`, `tests/guardian-rules.test.ts`.

**Behavior:**
- architecture: layer/`moduleBoundary` from drift config; imports of changed files resolved via
  ts-morph; `cannot_depend_on` checks; severity from rule.
- dependencies: forbidden from/to glob matching over changed import edges.
- protected-paths: glob matching (gitignore-style) on `GuardianChange` paths; `allow_ai` flag.
- api-change: compare exported symbols base vs HEAD for changed files (ts-morph `export
  declarations` diff; `breaking_only` filters to removals/signature changes).

**Tests:** per-rule fixtures with real temp repos; false-positive guards (no finding when rule
not applicable).

**Acceptance criteria:** 4 rule categories produce correct findings on fixtures; deterministic.

**Risks:** import-graph performance on large files; mitigated by limiting AST to changed files +
direct imports; `performance.maxFiles` budget applies.

**Dependencies:** Phase 3.

---

## Phase 5 — CLI integration

**Objective:** register `drift guardian` in `src/cli.ts` (commander), following the `ai-guard`
command pattern.

**Files:** `src/cli.ts`, `src/guardian/cli.ts` (command module), `tests/cli-guardian.test.ts`
(exec child-process tests mirroring `tests/ai-guard-cli.test.ts`).

**Flags:** `[path]`, `--base <ref>`, `--staged`, `--diff-file <file>`, `--stdin`,
`--format <human|json|sarif|github|check>`, `--output <file>`, `--check`, `--verbose`,
plus resource flags via `addResourceOptions`.

**Exit codes:** 0 pass / 1 violation / 2 input-config error.

**Acceptance criteria:** `drift guardian --base main` end-to-end from CLI; `--format check`
writes no output for CI use.

**Risks:** commander option conflicts; register under a distinct command name to avoid touching
existing commands.

**Dependencies:** Phase 4.

---

## Phase 6 — JSON + SARIF reporters

**Objective:** `src/guardian/reporters/` — human (Phase 5), `json.ts`, `sarif.ts`, `github.ts` +
`schemas/guardian-result.v1.json`.

**Files:** `reporters/json.ts`, `reporters/sarif.ts`, `reporters/github.ts`, `reporters/human.ts`,
`schemas/guardian-result.v1.json`, `tests/guardian-reporters.test.ts`.

**Interfaces:** `renderHuman(result): string`, `renderJson(result): string`,
`renderSarif(result): string`, `renderGithubAnnotations(result): string`.

**Acceptance criteria:** SARIF validated against 2.1.0 shape; JSON artifact includes `$schema` +
`toolVersion`; GitHub annotations well-formed.

**Risks:** SARIF schema drift; reuse `src/sarif.ts` mapping constants (additive extraction).

**Dependencies:** Phase 5.

---

## Phase 7 — GitHub Actions integration

**Objective:** `.github/actions/drift-guardian/action.yml` composite action + workflow docs;
public repo surface `eduardbar/drift-guardian@v1`.

**Files:** `.github/actions/drift-guardian/action.yml`, `action README`,
`.github/workflows/guardian-ci.yml` (dogfooding), `docs/guardian/actions.md`.

**Behavior:** checkout with `fetch-depth: 0`, run `drift guardian --base ${{ base }} --format
sarif --output guardian.sarif`, optional SARIF upload (`security-events: write`), optional check
run (`checks: write`), optional AI comment (when `ai.enabled` + key present).

**Tests:** action.yml referenced in a workflow; smoke-tested in CI on the drift repo.

**Risks:** `GITHUB_TOKEN` permission model changes; documented in BACKEND_SCHEMA §5.

**Dependencies:** Phase 6.

---

## Phase 8 — AI provider abstraction

**Objective:** `src/guardian/ai/` — provider interface (Phase 1), factory, redaction.

**Files:** `ai/provider.ts`, `ai/factory.ts`, `ai/redact.ts`, `.aiignore` support,
`tests/guardian-ai.test.ts`.

**Behavior:** `providerFactory(config.ai)`; redaction unit tests (env tokens, private keys,
`.aiignore` patterns); provider failure → AI omitted, deterministic verdict unaffected.

**Acceptance criteria:** redaction tests prove secrets never reach payload; factory returns typed
error for unknown provider.

**Risks:** provider HTTP contract variance; isolated behind the interface.

**Dependencies:** Phase 1 (interface), Phase 4 (context).

---

## Phase 9 — AI review

**Objective:** first real providers + `AIReview` assembly into `GuardianResult`.

**Files:** `ai/providers/openai.ts`, `ai/providers/anthropic.ts`, `ai/providers/ollama.ts`,
`ai/review.ts`, `tests/guardian-ai-review.test.ts` (mocked fetch).

**Behavior:** structured-output prompts; JSON schema validation; timeout + single retry;
`aiReview` attached when enabled and successful.

**Acceptance criteria:** mocked-provider tests prove schema validation, failure fallback, and
`max_findings` cap.

**Risks:** provider API changes; mocked tests isolate the core.

**Dependencies:** Phase 8.

---

## Phase 10 — Documentation and community readiness

**Objective:** public docs, MCP tool, packaging, good-first-issues.

**Files:** `src/mcp-server.ts` (add `guardian_analyze`), README section, `docs/guardian/*`
(already drafted), policy-pack format doc, `CONTRIBUTING` guardian section, npm publish check.

**Tests:** MCP tool registry test update; package-content test (dist glob).

**Acceptance criteria:** `drift mcp --inspect` lists Guardian tool; `npm pack` includes
`dist/guardian/*`; docs link to the six guardian docs.

**Risks:** MCP registry API changes; additive tool registration only.

**Dependencies:** Phase 9.

---

## Current status

| Phase | Status |
| --- | --- |
| 0 | done (this plan + TRD) |
| 1 | **done** — `src/guardian/types.ts`, barrel, exports |
| 2 | **done** — `src/guardian/change-collector.ts` |
| 3–10 | planned |
