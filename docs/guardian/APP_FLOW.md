# Drift Guardian — Application Flow (APP_FLOW)

**Status:** Draft v1
**Related:** `PRD.md` (what/why), `TRD.md` (how), `UI_UX_DESIGN_BRIEF.md` (presentation), `BACKEND_SCHEMA.md` (data).

This document describes every user-visible flow. Guardian is developer tooling: the "UI" is a
terminal, a GitHub check, and an MCP tool. Each flow lists what the user sees, what action runs,
and what state changes.

---

## 1. CLI flow

```
Install → Init → Configure → Analyze → Findings → Fix → Re-run
```

### 1.1 Install

**User sees:** `npm i -g @eduardbar/drift` (Guardian ships inside the drift package) or project
dev-dependency install. Node ^20 || ^22 required.

**Action:** npm installs the package; `drift --version` reports the version including Guardian.

**State change:** CLI available on PATH / `node_modules/.bin/drift`.

### 1.2 Init

```
drift guardian init [path]
```

**User sees:** "Creating drift.guard.yml" + a table of detected layers/modules and suggested
rules; summary of created files.

**Action:** `init` introspects the repo (existing drift config `layers`/`modules`, folder
conventions) and scaffolds a `drift.guard.yml` with safe defaults and comments. It never creates
blocking rules it cannot verify.

**State change:** `drift.guard.yml` created (version 1). Re-running `init` refuses to overwrite
without `--force`.

### 1.3 Configure

**User edits** `drift.guard.yml` (schema in `TRD.md §4`). Validation runs on every analyze:

- valid → proceeds;
- invalid → **exit code 2**, error names the field (e.g. `architecture.rules[0].from`).

**User sees:** "Config valid: 4 rules loaded" in verbose mode; errors printed with a caret-style
message.

**State change:** none on disk; the in-memory `GuardianConfig` is the artifact.

### 1.4 Analyze

```
drift guardian .                    # working tree vs HEAD
drift guardian --base main          # base..HEAD
drift guardian --staged             # staged only
drift guardian --diff-file pr.diff  # external diff
drift guardian --format json|sarif  # structured output
drift guardian --check              # exit-code-only mode for CI (no pretty output)
```

**User sees:** header with mode/ref, then grouped findings, then a verdict line:

```
Guardian: PASS  (4 files, 0 findings, 0.42s)
```

**Action:** change collector → context assembly → policy engine → reporters → optional AI review
(only if `ai.enabled`).

**State change:** none on disk. Exit code: `0` pass, `1` violation, `2` input/config error.

### 1.5 Findings

Findings render per `UI_UX_DESIGN_BRIEF.md §4`: severity tag, rule id, file/location, evidence,
suggestion.

**User sees:**

```
[BLOCKING] architecture/presentation-not-infra
src/api/user.ts:12
  imports from src/infrastructure/database.ts
  presentation layer must not depend on infrastructure
  Fix: move the call behind an interface in the domain layer.
```

### 1.6 Fix

The user edits the code. Guardian offers suggestions textually; auto-fix is **not** in MVP
(no write operations — safety-first).

### 1.7 Re-run

Re-running analyzes the new diff. The loop is the product: change → guard → fix → re-run.
Each run is stateless and deterministic for the same diff + config.

---

## 2. Pull Request flow

```
Developer pushes
→ GitHub Action (eduardbar/drift-guardian)
→ Guardian analysis (deterministic)
→ Policies evaluated
→ SARIF / Checks
→ AI explanation optional
→ Pass / Warn / Fail
```

### 2.1 Push

Developer pushes a branch and opens a PR (or updates one).

### 2.2 Action runs

`eduardbar/drift-guardian@v1` composite action:

```yaml
- uses: eduardbar/drift-guardian@v1
  with:
    base: ${{ github.event.pull_request.base.sha }}
    format: sarif
    upload-sarif: true
```

**Action steps:** check out repo with full history (`fetch-depth: 0` is configured by the
action), run `drift guardian --base <base> --format sarif`, write `guardian.sarif`.

### 2.3 Policies evaluated

Deterministic engine only. No LLM tokens consumed unless `ai.enabled: true` and a provider key
exists in the workflow environment.

### 2.4 Checks + SARIF

- `format: sarif` + `upload-sarif: true` → findings appear under **Security > Code scanning**
  with the rule id and location.
- The action also sets a **commit status/check** "Drift Guardian" with summary
  `Guardian: PASS — 0 blocking, 0 errors, 2 warnings`.

### 2.5 AI explanation (optional)

If enabled, the Action posts a **PR comment** (or attaches to the check) with the AIReview:
summary, top risk explanations, missing tests. Marked **"AI-generated advisory — not a merge
authority."**

### 2.6 Pass / Warn / Fail

| Outcome | Check result | Merge gate |
| --- | --- | --- |
| PASS | green | allowed |
| WARN | green or yellow (configurable) | allowed, flagged |
| FAIL | red | blocked |

`exit.fail_on: [blocking, error]` is the default gate; `warn_on_violation: true` keeps warnings
non-blocking.

**State change:** check status + SARIF upload; branch protection can require the "Drift Guardian"
check to pass.

---

## 3. MCP / Agent flow

```
AI coding agent
→ Drift architectural context (existing `drift mcp` context tool)
→ code changes
→ Guardian (new MCP tool guardian_analyze)
→ findings (structured JSON)
→ agent repairs changes
→ Guardian re-check
```

### 3.1 Context acquisition

The agent calls the existing MCP context tool to load architectural context (layers, modules,
boundaries) before editing.

### 3.2 Change + guard loop

1. Agent edits files.
2. Agent calls `guardian_analyze` with `{ base?: string, staged?: boolean }`.
3. Guardian returns `GuardianResult` JSON (deterministic findings; AI omitted unless requested).
4. Agent repairs the violations and calls `guardian_analyze` again.
5. Loop ends when verdict is `pass` (or the agent declares a legitimate exception for a human).

**State change:** none outside the repo; the tool is read-only.

**MCP tool contract (Phase 10):**

```
name: guardian_analyze
input:
  path: string       # repo root (defaults to MCP server cwd)
  base?: string      # base ref for diff
  staged?: boolean   # analyze staged changes
  include_ai?: boolean  # request optional AI review
output:
  GuardianResult     # verdict, findings, affectedFiles, summary
```

---

## 4. Optional web playground (educational, NOT MVP)

A local-only educational page (`drift guardian --playground`) to demo the engine on sample diffs.

### 4.1 What the user sees

A single HTML page: left = sample diff textarea, right = findings list with severity colors,
bottom = verdict badge. Preloaded sample diffs (layer violation, protected path, breaking API).

### 4.2 What the user does

- Paste a unified diff → click **Analyze**.
- Toggle a policy set (backend service / frontend layers / open source release).
- Click a finding → highlighted diff line + rule explanation.

### 4.3 State changes

- Local only, no server, no persistence.
- Deterministic re-render on each Analyze; no AI integration in MVP.
- Excluded from the product roadmap unless community demand appears.

---

## 5. Flow summary matrix

| Flow | Entry | Main action | Output | State change | Exit |
| --- | --- | --- | --- | --- | --- |
| CLI | terminal | `drift guardian` | human/JSON/SARIF | none on disk | 0/1/2 |
| PR | push | Action | checks + SARIF + optional comment | check status, SARIF upload | pass/fail |
| MCP | agent tool call | `guardian_analyze` | `GuardianResult` JSON | none | result object |
| Playground | local page | Analyze | findings render | none (ephemeral) | n/a |
