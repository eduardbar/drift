# Drift Guardian — Backend Schema

**Status:** Draft v1
**Scope:** internal domain models, serialization, versioning, GitHub auth, AI provider
environment contract.

---

## 1. No central database — explicit decision

The MVP **does not need and does not use a central database or server.**

- All analysis is read-only over the local git repo + local config files.
- The only persisted artifacts are **output files the user explicitly writes**:
  `guardian.sarif`, `guardian.json`, `drift.guard.yml` (via `init`).
- No telemetry, no usage collection, no cloud sync. `$0/month` hosting.
- A future opt-in `drift cloud` ingest (existing drift surface) can consume `GuardianResult`
  JSON the same way it ingests drift reports today — that remains out of Guardian MVP scope.

---

## 2. Internal domain models

Defined in `src/guardian/types.ts` (Phase 1). All types are JSON-serializable.

### 2.1 `GuardianConfig`

The loaded `drift.guard.yml`/`.json`/`.ts` content. Canonical schema: TRD §4.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `version` | `1` | required | config schema version |
| `architecture.rules[]` | `GuardianArchitectureRule[]` | `[]` | layer dependency rules |
| `dependencies.forbidden[]` | `GuardianForbiddenDependency[]` | `[]` | from/to import rules |
| `protected_paths[]` | `GuardianProtectedPath[]` | `[]` | glob patterns |
| `api` | `{ detect_public_changes, breaking_only }` | `{true, true}` | API-change detection |
| `ai` | `GuardianAiConfig` | disabled | AI layer (advisory) |
| `exit` | `{ fail_on, warn_on_violation }` | `{['blocking','error'], true}` | CI gate mapping |

```ts
interface GuardianArchitectureRule {
  id?: string
  from: string | string[]
  cannotDependOn?: string | string[]
  severity?: GuardianSeverity
  enabled?: boolean
}
interface GuardianForbiddenDependency {
  from?: string          // glob, importer
  to: string             // glob, imported
  reason?: string
  severity?: GuardianSeverity
}
interface GuardianProtectedPath {
  pattern: string        // glob
  reason?: string
  severity?: GuardianSeverity
  allowAi?: boolean      // default false → never sent to provider
}
interface GuardianAiConfig {
  enabled: boolean
  provider?: string
  model?: string
  review?: { architecture?; missingTests?; behavior?; prSummary? }
  maxFindings?: number
  timeoutSeconds?: number
}
```

### 2.2 `GuardianRule`

Compiled, resolved rule (from config + defaults) fed to the engine.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | stable id (explicit or auto `category/<slug>`) |
| `category` | `GuardianFindingCategory` | `architecture \| dependency \| protected-path \| api-change \| policy \| custom` |
| `severity` | `GuardianSeverity` | resolved severity |
| `enabled` | `boolean` | resolved enabled flag |
| `description?` | `string` | human rule statement |
| `condition?` | `Record<string, unknown>` | opaque engine input, versioned by policy |

### 2.3 `GuardianPolicy`

Versioned container of rules. `version: "1"` for MVP. Future policy packs replace `rules` by
merging pack rules (TRD §9, PRD §9).

### 2.4 `GuardianFinding`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | deterministic: `ruleId + path + line` hash |
| `ruleId` | `string` | e.g. `architecture/presentation-not-infra` |
| `category` | `GuardianFindingCategory` | |
| `severity` | `GuardianSeverity` | |
| `message` | `string` | human text |
| `locations` | `GuardianLocation[]` | at least one |
| `evidence?` | `string` | code/diff excerpt |
| `suggestion?` | `string` | optional fix hint |
| `metadata?` | `Record<string, unknown>` | rule-specific (e.g. from→to) |

`GuardianLocation`: `{ file: string; line?; column?; endLine? }`.

### 2.5 `GuardianChange`

Per-file diff summary produced by the change collector.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `added \| modified \| deleted \| rename \| binary` | from `UnifiedDiffEntry` |
| `oldPath?` / `newPath?` | `string` | normalized, `/`-separated |
| `additions` / `deletions` | `number` | counted from hunks |
| `changedLines` | `number` | additions + deletions |
| `hunks` | `DiffHunk[]` | reused from `types/ai-guard.ts` |

Lifecycle: collected → used by engine → serialized in `GuardianResult.changes` (or omitted in
`--check` mode to keep output small).

### 2.6 `GuardianContext`

Assembled per run: `projectPath`, `source`, `baseRef?`, `branch?`, `changes[]`, `config`,
`analysis { layers?, modules? }` (drift config shapes). Immutable during a run.

### 2.7 `GuardianResult`

| Field | Type | Notes |
| --- | --- | --- |
| `verdict` | `pass \| warn \| fail` | derived from findings + `exit` config |
| `passed` | `boolean` | `verdict === 'pass'` |
| `findings` | `GuardianFinding[]` | sorted: severity desc, file, line |
| `affectedFiles` | `string[]` | unique changed paths with ≥1 finding (or all changed paths in verbose) |
| `changes` | `GuardianChange[]` | diff summary |
| `summary` | `{ blocking; errors; warnings; infos }` | counts |
| `scannedAt` | `string` | ISO timestamp |
| `aiReview?` | `AIReview` | present only when AI ran successfully |

### 2.8 `AIReview`

| Field | Type | Notes |
| --- | --- | --- |
| `provider` | `string` | provider name |
| `summary` | `string` | PR summary |
| `riskExplanations` | `{ findingId; explanation; confidence? }[]` | per-finding |
| `missingTests` | `string[]` | suggested tests |
| `behavioralRisks` | `string[]` | behavior-level risks |
| `generatedAt` | `string` | ISO timestamp |

---

## 3. Relations

```
GuardianConfig ──resolve──▶ GuardianPolicy ──1..*──▶ GuardianRule
GuardianContext ──1..*────▶ GuardianChange
GuardianPolicy ──evaluate──▶ GuardianFinding[]  (via engine)
GuardianFinding[] ──derive──▶ GuardianResult.verdict / summary
GuardianResult ──optional──▶ AIReview (advisory)
```

No shared mutable state; a run is a pure function of `(repo, config, source)`.

---

## 4. Serialization

- **JSON**: `GuardianResult` as-is; `$schema` + `toolVersion` added for artifact files
  (mirrors `DriftReportJson` pattern in `types/core.ts`).
- **SARIF 2.1.0**: `$schema` `json.schemastore.org/sarif-2.1.0.json`, `version: "2.1.0"`,
  `runs[0].tool.driver.name: "drift-guardian"`, rules table, results with locations and
  properties (severity, category). Reuses mapping patterns from `src/sarif.ts`.
- **Files**: `guardian.sarif`, `guardian.json` written only on explicit `--output`.
- **Path convention**: all paths repo-relative, `/`-separated (even on Windows).

### 4.1 Versioning

- `GuardianConfig.version`: schema version — `1` MVP; loader rejects unknown versions (exit 2).
- `GuardianPolicy.version`: rule-set version, echoed in output metadata.
- `toolVersion`: package version (from `package.json` via `createRequire`, like `sarif.ts`).
- Output artifacts carry `$schema: "schemas/guardian-result.v1.json"` + `toolVersion`.

---

## 5. GitHub integration

### 5.1 Authentication

The Action uses the built-in `GITHUB_TOKEN` (`github.token`); no personal token required.

### 5.2 Minimal permissions

```yaml
permissions:
  contents: read        # checkout + diff
  checks: write         # create "Drift Guardian" check run
  security-events: write  # upload SARIF (code scanning)
  pull-requests: write  # optional AI advisory comment (ai.enabled)
```

Principle of least privilege: the Action requests `contents: read` by default and only the
permissions required by enabled features.

### 5.3 Token handling

- `GITHUB_TOKEN` exists only in the workflow environment, never in Guardian output or AI
  payloads (redacted by `redact.ts`).
- Local CLI uses no GitHub auth for deterministic analysis (pure git). PR comments from local
  CLI are out of MVP scope.

---

## 6. AI providers — environment contract

### 6.1 BYOK environment variables

| Provider | Var | Required for use |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `ai.provider: openai` |
| Anthropic | `ANTHROPIC_API_KEY` | `ai.provider: anthropic` |
| Ollama | `OLLAMA_BASE_URL` (default `http://localhost:11434`) | `ai.provider: ollama`; no key |
| custom | any | provider module documents its vars |

### 6.2 Rules

- **API keys are never stored**: not in config, not in output, not in memory beyond the request.
- Missing key + enabled provider → typed config/runtime warning; AI layer omitted; exit code
  unaffected (deterministic verdict still governs).
- `.aiignore` + `protected_paths[].allow_ai: false` + redaction (TRD §6) apply before any
  payload is built.
- Local providers (Ollama) work with zero external egress.

---

## 7. Schema files (future)

- `schemas/guardian-result.v1.json` — JSON Schema for `GuardianResult` artifact (Phase 6).
- `schemas/guardian-config.v1.json` — JSON Schema for config (Phase 3).
- Both follow the repo convention (`schemas/drift-*.v1.json`, `additionalProperties: false`,
  `$id` set).
