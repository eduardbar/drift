# Drift Guardian — Technical Requirement Document (TRD)

**Status:** Draft v1
**Target codebase:** drift v1.7.0, TypeScript strict, ESM (`"type": "module"`), Node ^20 || ^22
**Documentation index:** see `docs/guardian/` — PRD (product), APP_FLOW (flows), UI_UX_DESIGN_BRIEF (presentation), BACKEND_SCHEMA (data), IMPLEMENTATION_PLAN (phases).

---

## 1. Technical decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Language / runtime | TypeScript strict, Node 20/22, ESM | Matches drift; zero new runtime requirements. |
| AST | `ts-morph ^27` (existing) | Reuse Drift's `analyzeFile`/project machinery. |
| Git | native `git` CLI via `child_process` (`execFileSync`), never shell interpolation | Existing convention in `src/git.ts`, `src/ai-guard-diff.ts`; no new dependency; safer for refs. |
| Diff parsing | reuse `parseUnifiedDiff`/`UnifiedDiffEntry`/`DiffHunk` from `src/ai-guard-diff.ts` | Already hardened (path traversal/absolute/NUL validation, rename/binary handling). |
| CLI | commander (existing `src/cli.ts`) | Add `drift guardian` subcommand in Phase 5. |
| Config | `drift.guard.yml` canonical; typed loader; JSON + TS variants | YAML is the standard for guard tooling; loader validates into typed `GuardianConfig`. |
| JSON Schema / validation | Typed TS interfaces + hand-rolled validator (no new dep in MVP); schema file `schemas/guardian-result.v1.json` | Repo has no zod; a small validator keeps the dependency surface unchanged. |
| SARIF | SARIF 2.1.0 via existing `src/sarif.ts` patterns | Reuse level mapping (`error|warning|note`) and artifact URI normalization. |
| MCP | extend `src/mcp-server.ts` tool registry | Existing 6-tool server; add `guardian_analyze`. |
| Tests | Vitest 4 (`tests/**/*.test.ts`, real temp git repos) | Matches repo; `tests/git.test.ts` fixture pattern. |
| AI providers | interface `AIReviewProvider` + provider factory; HTTP via `fetch` | No SDK dependency; providers implement one interface. |
| Hosting | none; $0/month | CLI + Action + BYOK. |

---

## 2. Component architecture

```
Git Diff (stdin | staged | base ref | diff file | working tree)
   │
   ▼
Change Collector  (src/guardian/change-collector.ts)
   │  produces GuardianChange[] (reuses parseUnifiedDiff)
   ▼
Guardian Context  (src/guardian/context.ts)
   │  merges changes + drift.config.ts layers/modules + drift.guard.yml
   ▼
Policy Engine     (src/guardian/engine.ts)  [Phase 3]
   │  evaluates GuardianRule[] against context
   ├── architecture rules     (layer / module boundaries)
   ├── dependency rules       (forbidden from→to imports)
   ├── protected path rules   (glob matching on changed paths)
   └── API-change rules       (public export diff via ts-morph)
   ▼
GuardianFinding[]
   │
   ├── CLI reporter  (human terminal)      [Phase 5/6]
   ├── JSON reporter (GuardianResult)      [Phase 6]
   ├── SARIF reporter (SARIF 2.1.0)        [Phase 6]
   └── optional AI review (AIReviewProvider, advisory) [Phase 8/9]
```

### 2.1 Module layout

```
src/guardian/
  index.ts              barrel: public API
  types.ts              domain model (Phase 1)
  change-collector.ts   git change collection (Phase 2)
  context.ts            GuardianContext assembly (Phase 3)
  engine.ts             policy engine (Phase 3)
  rules/
    architecture.ts     layer/module boundary evaluation (Phase 4)
    dependencies.ts     forbidden dependency evaluation (Phase 4)
    protected-paths.ts  glob matching (Phase 4)
    api-change.ts       public API diff (Phase 4)
  config/
    loader.ts           drift.guard.yml/json/ts loading + validation (Phase 3)
    validator.ts        typed validation of GuardianConfig
  reporters/
    human.ts            terminal output (Phase 5/6)
    json.ts             JSON output (Phase 6)
    sarif.ts            SARIF 2.1.0 (Phase 6)
    github.ts           GitHub annotations (Phase 6/7)
  ai/
    provider.ts         AIReviewProvider interface + factory (Phase 8)
    redact.ts           .aiignore + secret redaction (Phase 8)
    providers/
      openai.ts         (Phase 8/9)
      anthropic.ts      (Phase 8/9)
      ollama.ts         (Phase 8/9)
    review.ts           AIReview assembly (Phase 9)
```

---

## 3. Domain interfaces (Phase 1)

Defined in `src/guardian/types.ts`. Names follow the repo's `Guardian*` convention.

```ts
export type GuardianSeverity = 'info' | 'warning' | 'error' | 'blocking'

export type GuardianFindingCategory =
  | 'architecture'
  | 'dependency'
  | 'protected-path'
  | 'api-change'
  | 'policy'
  | 'custom'

export interface GuardianLocation {
  file: string
  line?: number
  column?: number
  endLine?: number
}

export interface GuardianFinding {
  id: string
  ruleId: string
  category: GuardianFindingCategory
  severity: GuardianSeverity
  message: string
  locations: GuardianLocation[]
  evidence?: string      // snippet or diff excerpt that triggered the rule
  suggestion?: string
  metadata?: Record<string, unknown>
}

export interface GuardianRule {
  id: string
  category: GuardianFindingCategory
  severity: GuardianSeverity
  enabled: boolean
  description?: string
  /** Opaque condition interpreted by the engine. Versioned by GuardianPolicy.version. */
  condition?: Record<string, unknown>
}

export interface GuardianPolicy {
  id: string
  name: string
  description?: string
  version: string
  rules: GuardianRule[]
}

export interface GuardianChange {
  status: 'added' | 'modified' | 'deleted' | 'rename' | 'binary'
  oldPath?: string
  newPath?: string
  additions: number
  deletions: number
  changedLines: number
  hunks: DiffHunk[]          // reuse from types/ai-guard.ts
}

export interface GuardianContext {
  projectPath: string
  source: DiffSource          // reuse from types/ai-guard.ts
  baseRef?: string
  branch?: string
  changes: GuardianChange[]
  config: GuardianConfig
  analysis: {
    layers?: LayerDefinition[]      // from drift.config.ts
    modules?: ModuleBoundary[]      // from drift.config.ts
  }
}

export type GuardianVerdict = 'pass' | 'warn' | 'fail'

export interface GuardianResult {
  verdict: GuardianVerdict
  passed: boolean
  findings: GuardianFinding[]
  affectedFiles: string[]
  changes: GuardianChange[]
  summary: { blocking: number; errors: number; warnings: number; infos: number }
  scannedAt: string
  aiReview?: AIReview
}

export interface AIReview {
  provider: string
  summary: string
  riskExplanations: Array<{ findingId: string; explanation: string; confidence?: number }>
  missingTests: string[]
  behavioralRisks: string[]
  generatedAt: string
}

export interface AIReviewProvider {
  readonly name: string
  review(context: GuardianContext, findings: GuardianFinding[]): Promise<AIReview | undefined>
}
```

`GuardianResult` carries the verdict. Verdict derivation (Phase 6):

- `fail`  — at least one `blocking` or `error` finding;
- `warn`  — no blocking/error, at least one `warning`; configurable via `exit.failOn`;
- `pass`  — otherwise.

Exit codes (match `ai-guard` convention): `0` pass, `1` policy violation, `2` input/config error.

---

## 4. Configuration schema (`drift.guard.yml`)

Definitive schema — this is the contract the loader validates.

```yaml
version: 1

architecture:
  # Layer rules mirror drift.config.ts `layers` (patterns + canImportFrom).
  # `from` matches a layer name; cannot_depend_on lists layer names forbidden as targets.
  rules:
    - id: presentation-not-infra        # optional; default auto-generated
      from: presentation                # layer name or glob
      cannot_depend_on:
        - infrastructure
      severity: blocking                # info | warning | error | blocking (default: error)
      enabled: true                     # default true

dependencies:
  forbidden:
    - from: "src/**"                    # optional; matches importer path
      to: "src/legacy/**"               # matches imported path
      reason: "Legacy module is frozen"
      severity: warning

protected_paths:
  - pattern: "src/auth/**"
    reason: "Auth code requires maintainer review"
    severity: blocking
    allow_ai: false                     # never send this path's content to an AI provider
  - pattern: "migrations/**"
    reason: "Migrations are append-only"
    severity: error

api:
  detect_public_changes: true           # compare exported symbols between base and HEAD
  breaking_only: true                   # only flag removals / signature changes

ai:
  enabled: false                        # opt-in; deterministic analysis never needs this
  provider: openai                      # openai | anthropic | ollama | <custom module>
  model: gpt-4o-mini
  review:
    architecture: true
    missing_tests: true
    behavior: true
    pr_summary: false
  max_findings: 20                      # cap findings sent to the provider
  timeout_seconds: 60

exit:
  fail_on: [blocking, error]            # which severities fail CI (default: blocking, error)
  warn_on_violation: true               # warn → exit 0 unless fail_on matched
```

### 4.1 Config precedence

1. Built-in defaults (all rules off except `protected_paths` when a `drift.guard.yml` exists).
2. `drift.guard.yml` / `drift.guard.json` / `drift.guard.ts` (first found, in that order).
3. Optional `guardian` section inside `drift.config.ts` (merged over the file).
4. CLI flags (highest).

### 4.2 Loader contract

```ts
export interface GuardianConfigLoader {
  load(projectRoot: string): Promise<GuardianConfig | undefined>
}
```

- `.ts`/`.js` load via `pathToFileURL` dynamic import (same as `src/config.ts`).
- `.json` parse + validate; `.yml` requires a YAML parser — **dependency decision deferred to
  Phase 3**: either add `yaml` (pure JS, no native build) or implement a documented subset.
  The MVP loader accepts `.json` and `.ts`; the `.yml` extension is the canonical format and
  ships with the `yaml` dependency decision (see IMPLEMENTATION_PLAN Phase 3 risk).
- Validation errors are typed (`GuardianConfigError` with path) and exit with code `2`.

---

## 5. Reuse map (do not duplicate)

| Capability | Existing location | Guardian reuse |
| --- | --- | --- |
| Unified diff parsing + path safety | `src/ai-guard-diff.ts` (`parseUnifiedDiff`, `readDiffFile`) | Change collector parses via this module. |
| Git diff readers | `src/git.ts` (`readStagedDiff`, `readDiffFromBase`) | Collector reads diffs through these. |
| AST analysis | `src/analyzer.ts` (`analyzeFile`, `analyzeProject`), `ts-morph` | API-change rule diffing, import resolution. |
| Layers / module boundaries config | `src/types/config.ts` (`LayerDefinition`, `ModuleBoundary`), `drift.config.ts` | `GuardianContext.analysis`; architecture rules build on the same shapes. |
| SARIF 2.1.0 | `src/sarif.ts` (`toSarif`, `diffToSarif`, `SarifLevel`) | Guardian SARIF reporter reuses mapping helpers (extracted as needed, additive). |
| CLI conventions | `src/cli.ts` (commander, `addResourceOptions`, exit codes) | `guardian` command registered in Phase 5 following `ai-guard` registration. |
| MCP server | `src/mcp-server.ts` | New tool registered in the existing registry (Phase 10). |
| GitHub Actions | `.github/actions/drift-scan/action.yml` (composite) | `drift-guardian` composite action mirrors this pattern. |
| Exit code contract | `ai-guard` 0/1/2 | Guardian uses the same contract. |

---

## 6. Security

### 6.1 Never sent to AI providers

- `.env` / secrets / credentials / private keys;
- files matched by `.aiignore` (or `protected_paths[].allow_ai: false`);
- binary files; files > `max_findings` budget;
- content not related to the change (only affected files' diff + rule descriptions go out).

`.aiignore` syntax mirrors `.gitignore` (one glob per line, `#` comments, negation `!`).
Detection is independent of git: `.aiignore` at repo root, plus repo-relative patterns.

### 6.2 Automatic redaction

Before any provider call, `redact.ts` strips:

- values of `GITHUB_TOKEN` / `GH_TOKEN` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `ANY_API_KEY`
  (name + value patterns);
- private key blocks (`-----BEGIN ... PRIVATE KEY-----`);
- `token=`/`password=`/`secret=`/`api_key=` value patterns in the diff text.

### 6.3 Local safety

- The collector never writes to the repo (read-only git commands); diff application (used by
  `ai-guard`) is not part of Guardian MVP.
- Refs are passed as argv (never shell-interpolated), inheriting `src/git.ts` protections.
- Diff paths validated by `parseUnifiedDiff` (absolute / `..` / NUL rejection).

---

## 7. AI provider abstraction

```ts
export interface AIReviewProvider {
  readonly name: string
  review(context: GuardianContext, findings: GuardianFinding[]): Promise<AIReview | undefined>
}
```

- The core depends only on this interface (no SDK imports in `engine.ts`).
- A `providerFactory(config.ai)` maps `openai` | `anthropic` | `ollama` | custom module name →
  provider instance; unknown provider → typed config error (exit 2).
- HTTP transport: Node 20/22 global `fetch`; JSON body with a `response_format`/structured-output
  contract per provider; response schema validated before being accepted as `AIReview`.
- Timeouts, retry (1 retry with backoff), and failure behavior: **provider failure → AI layer
  silently omitted (`aiReview: undefined`) and a `warning`-severity note**, never a false fail.
- Ollama runs `http://localhost:11434` by default — usable without any API key.
- BYOK: providers read env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`); keys are never stored,
  never logged, never written to config or output.

Structured outputs: each provider's prompt requires JSON adhering to `AIReview`; parse failures
are treated as provider failure (omitted AI layer).

---

## 8. Performance

Priority pipeline (never analyze the whole repo):

```
git diff → affected files → affected dependency graph → targeted analysis
```

- Change collector is O(diff size), no full scan.
- Architecture rules evaluate only changed files' import graphs; `ts-morph` project is built
  only for changed files (plus their direct imports as needed).
- API-change rules parse only the changed files at base and HEAD trees.
- Budget caps: `ai.max_findings`, `performance.maxFiles` from drift's resource flags apply.
- Target: < 2 s for ≤ 500 changed lines on a typical repo; ~0 s for deterministic-only.

---

## 9. Hosting

- Core: zero hosting. `$0/month` operating cost.
- GitHub Action: composite action running the npm package (mirrors `drift-scan` pattern);
  SARIF upload via `github/codeql-action/upload-sarif`.
- AI: BYOK only; no proxying service.

---

## 10. Out of scope (TRD)

- Central service, DB, billing (see BACKEND_SCHEMA).
- Model training/fine-tuning.
- IDE extension (drift VS Code extension exists; Guardian is CLI/Action/MCP first).
- Non-TypeScript language support in MVP.
