# drift

Stop merging AI-generated technical debt blindly. `drift` gives every PR a structural trust score before it hits `main`.

![drift demo preview](./assets/readme/drift-demo-v2.gif)

[Live landing page](https://drift-ai-detection.vercel.app/)

## Quick Install

```bash
npx @eduardbar/drift scan .
```

![npm](https://img.shields.io/npm/v/@eduardbar/drift?color=6366f1&label=npm)
![license](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)
![ts-morph](https://img.shields.io/badge/powered%20by-ts--morph-6366f1.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

## Why Now

- AI-assisted output is faster than review capacity in most teams.
- Structural debt compounds silently until velocity collapses.
- Traditional linters catch style and correctness, not merge trust.
- `drift` gives you deterministic signals (`scan`, `review`, `trust`) you can gate in CI.

[Why](#why) · [Installation](#installation) · [Product Docs](#product-docs) · [Commands](#commands) · [Rules](#rules) · [Score](#score) · [Configuration](#configuration) · [CI Integration](#ci-integration) · [drift-ignore](#drift-ignore) · [Contributing](#contributing)

---

## Why

AI coding tools ship code fast. They also leave behind consistent, predictable structural patterns that accumulate silently: files that grow to 600 lines, catch blocks that swallow errors, exports that nothing imports, functions duplicated across three modules because the model regenerated instead of reusing.

GitClear's 2024 analysis of 211M lines of code found a **39.9% drop in refactoring activity** and an **8x increase in duplicated code blocks** since AI tools became mainstream. A senior engineer on r/vibecoding put it plainly: _"The code looks reviewed. It isn't. Nobody's reading 400-line files the AI dumped in one shot."_

drift gives you debt signals (`scan`, `review`) and a trust decision layer (`trust`) so teams can merge with confidence instead of guesswork.

**How drift compares to existing tools:**

| Tool | What it does | What it misses |
|------|--------------|----------------|
| ESLint | Correctness and style within a single file | Structural patterns, cross-file dead code, architecture violations |
| SonarQube | Enterprise-grade static analysis | Costs money, requires infrastructure, overwhelming for small teams |
| drift | Structural debt + AI-specific patterns + cross-file analysis + 0–100 score | Not a linter — does not replace ESLint |

---

## Installation

```bash
# Run without installing
npx @eduardbar/drift scan .

# Install globally
npm install -g @eduardbar/drift

# Install as a dev dependency
npm install --save-dev @eduardbar/drift
```

---

## Product Docs

- Product vision: [`docs/product/vision.md`](./docs/product/vision.md)
- Product user story: [`docs/product/user-story.md`](./docs/product/user-story.md)
- Strategic roadmap: [`docs/product/roadmap.md`](./docs/product/roadmap.md)
- AI continuity protocol: [`docs/product/ai-continuity.md`](./docs/product/ai-continuity.md)
- Architecture index and ADRs: [`docs/architecture/index.md`](./docs/architecture/index.md)
- Product requirements: [`docs/PRD.md`](./docs/PRD.md)
- Trust core release checklist: [`docs/trust-core-release-checklist.md`](./docs/trust-core-release-checklist.md)
- Rules catalog (source-of-truth snapshot): [`docs/rules-catalog.md`](./docs/rules-catalog.md)
- Contributor/agent workflow guide: [`docs/AGENTS.md`](./docs/AGENTS.md)

---

## Commands

### `drift init`

Scaffold first-run setup for drift in an existing repository.

```bash
drift init
drift init --preset node-backend
drift init --preset react-app --ci --baseline
```

| Flag | Description |
|------|-------------|
| `--preset <type>` | Generate `drift.config.ts` using one of: `node-backend`, `react-app`, `hexagonal`, `monorepo` |
| `--ci` | Generate `.github/workflows/drift-review.yml` |
| `--baseline` | Generate `drift-baseline.json` from the current scan |

`drift init` is non-destructive for pre-existing targets: drift skips generation when an output file already exists and prints a warning.

---

### `drift doctor`

Run environment diagnostics for Node/runtime and project readiness.

```bash
drift doctor
drift doctor --json
```

| Flag | Description |
|------|-------------|
| `--json` | Output structured doctor report JSON |

Checks include Node major version support (`>=20`), `package.json`, ESM mode, `tsconfig.json`, source file count, optional `--low-memory` recommendation, and `drift.config.*` detection.

When `--json` is enabled, output includes `$schema` and `toolVersion` metadata and follows [`schemas/drift-doctor.v1.json`](./schemas/drift-doctor.v1.json).

---

### Repository smoke (local source CLI)

Run a non-destructive end-to-end smoke suite against any repository path using local source commands (`node --import tsx ./src/cli.ts ...`).

```bash
npm run smoke:repo -- ../target-repo --base origin/main
npm run smoke:repo -- ../target-repo --dry-run
```

The script writes JSON + Markdown summaries and command logs under `.drift-smoke/<repo>-<timestamp>/`.

Use `--ai-integration` for the bounded built-CLI smoke covering context freshness, MCP inspection, and a safe `ai-guard` diff:

```bash
npm run build
node ./scripts/smoke-repo.mjs ../target-repo --ai-integration --out .drift-smoke/ai
```

This smoke is local and does not contact an API, require credentials, or start a long-running process.

### `drift context [path]`

Generate the local, AI-readable project context used by coding assistants. The happy path writes `.drift/context.md` and keeps the complete document in memory before the single file write.

```bash
drift context .
drift context . --max-issues 10
drift context . --format json > context.json
drift init --context
```

Run the same command with `--ci` to check freshness without rewriting the file. It exits `1` when the file is missing or its recorded score differs from the current score:

```bash
drift context . --ci
```

Recommended workflow: generate `.drift/context.md` locally, let the assistant use it as repository context, run `drift context . --ci` in CI, and review the diff with `drift review` or `drift guard`. The generated file is local context; add it to `.gitignore` if it should not be committed.

### `drift mcp [path]`

Expose drift to an MCP-compatible assistant through a local stdio process. `--inspect` prints the six-tool JSON contract and exits, which is useful for setup checks without starting a server:

```bash
drift mcp . --inspect
drift mcp .
```

OpenCode configuration (`opencode.json` or the equivalent MCP settings):

```json
{
  "mcp": {
    "drift": {
      "type": "local",
      "command": ["drift", "mcp", "."]
    }
  }
}
```

The server is local stdio only. It uses no network service, API key, cloud account, or hosted telemetry.

### `drift ai-guard [path]`

Audit a proposed diff in an isolated before/after workspace. Start with a safe, deterministic stdin diff; use a budget or explicit blocking rules when the command is a merge gate:

```bash
git diff --cached | drift ai-guard . --stdin --format json
drift ai-guard . --staged --format json
drift ai-guard . --diff-file change.diff --budget 0 --block-on debug-leftover,large-file
drift ai-guard . --base origin/main --format json
```

Exit behavior is deterministic: `0` means the proposed change passes, `1` means the budget or `--block-on` policy rejects it, and `2` means the input or command is invalid. `ai-guard` is a local static-analysis guard; it does not call an AI provider and requires no API key or cloud service.

The policy is intentionally zero-regression by default for the proposed diff. That does **not** claim that the whole repository has zero drift; it only prevents this change from adding disallowed findings relative to its selected baseline.

### `drift scan [path]`

Scan a directory and print a scored report to stdout.

```bash
drift scan .
drift scan ./src
drift scan ./src --output report.md
drift scan ./src --json
drift scan ./src --ai
drift scan ./src --fix
drift scan ./src --min-score 50
drift scan ./src --low-memory --max-file-size-kb 1024
```

**Options:**

| Flag | Description |
|------|-------------|
| `--output <file>` | Write Markdown report to a file instead of stdout |
| `--format <type>` | Output format: `console\|json\|markdown\|ai\|sarif` |
| `--json` | Output raw `DriftReport` JSON |
| `--ai` | Output structured JSON optimized for LLM consumption (Claude, GPT, etc.) |
| `--fix` | Print inline fix suggestions for each detected issue |
| `--min-score <n>` | Exit with code 1 if the overall score strictly exceeds this threshold |
| `--low-memory` | Analyze files in bounded chunks to reduce peak RAM |
| `--chunk-size <n>` | Files per chunk in low-memory mode (default: 40) |
| `--max-files <n>` | Soft cap on analyzed files; extra files are skipped with diagnostics |
| `--max-file-size-kb <n>` | Skip oversized files with diagnostics to avoid OOM |
| `--with-semantic-duplication` | Keep semantic duplication rule enabled in low-memory mode |

`--min-score` currently fails when `totalScore > n` (strictly greater than), matching CLI behavior.

**Example output:**

```
  drift  —  technical debt detector
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

### `drift guard [path]`

Evaluate drift regression guardrails against a git diff (`--base`) or a baseline file/object.

```bash
drift guard ./src --base origin/main
drift guard ./src --baseline drift-baseline.json
drift guard ./src --base origin/main --budget 3 --by-severity error=0,warning=2,info=5
drift guard ./src --base origin/main --json
```

| Flag | Description |
|------|-------------|
| `--base <ref>` | Diff mode: compare current state vs git ref |
| `--baseline <file>` | Baseline mode: compare against baseline JSON (default file name: `drift-baseline.json`) |
| `--budget <n>` | Maximum allowed score delta |
| `--by-severity <spec>` | Severity thresholds as CSV `key=value` pairs (`error`, `warning`, `info`) |
| `--json` | Output full `GuardResult` JSON |
| `--low-memory` / `--chunk-size <n>` / `--max-files <n>` / `--max-file-size-kb <n>` / `--with-semantic-duplication` | Analysis resource controls shared with scan/diff/report/badge/ci/trust |

Behavior:
- With `--base`, guard enforces no-regression checks for score and total issues, then applies optional budget/severity thresholds.
- Without `--base`, guard requires a baseline (inline or file) and compares only against available baseline anchors.
- Exit code is `1` when any guard check fails.

When `--json` is enabled, output includes `$schema` and `toolVersion` metadata and follows [`schemas/drift-guard.v1.json`](./schemas/drift-guard.v1.json).

---

### `drift diff [ref]`

Compare the current project state against any git ref. Defaults to `HEAD~1`.

```bash
drift diff                # HEAD vs HEAD~1
drift diff HEAD~3         # HEAD vs 3 commits ago
drift diff main           # HEAD vs branch main
drift diff abc1234        # HEAD vs a specific commit
drift diff --format sarif # Output SARIF for code scanning
drift diff --json         # Output raw JSON diff
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format <type>` | Output format: `console\|json\|sarif` |
| `--json` | Output raw JSON diff |

Shows score delta, issues introduced, and issues resolved since the given ref.

---

### `drift review`

Review drift against a git base ref and output a PR-ready markdown comment.

```bash
drift review --base origin/main
drift review --base main --comment
drift review --base HEAD~3 --json
drift review --base origin/main --format sarif
drift review --base origin/main --fail-on 5
```

| Flag | Description |
|------|-------------|
| `--base <ref>` | Git base ref to compare against (default: `origin/main`) |
| `--format <type>` | Output format: `console\|json\|markdown\|sarif` |
| `--json` | Output structured review JSON |
| `--comment` | Print only the markdown body for PR comments |
| `--fail-on <n>` | Exit code 1 when score delta is greater than or equal to `n` |

`drift review` is best used as supplementary diff context alongside `drift trust` in pull-request workflows.

---

### `drift trust [path]`

Compute merge trust baseline for local checks and CI merge gates.

```bash
drift trust
drift trust ./src
drift trust ./src --json
drift trust ./src --base origin/main
drift trust ./src --base origin/main --markdown
drift trust ./src --format sarif
drift trust ./src --markdown --output trust.md
drift trust ./src --min-trust 45
drift trust ./src --max-risk HIGH
drift trust ./src --branch main
drift trust ./src --branch release/v1.5.0 --policy-pack strict --explain-policy
drift trust ./src --advanced-trust
drift trust ./src --advanced-trust --previous-trust ./artifacts/prev-trust.json
drift trust ./src --advanced-trust --history-file ./drift-history.json --markdown
```

| Flag | Description |
|------|-------------|
| `--base <ref>` | Compare against a git base ref and include deterministic diff-aware penalties/bonuses |
| `--format <type>` | Output format: `console\|json\|markdown\|sarif` |
| `--json` | Output structured trust JSON (`trust_score`, `merge_risk`, `top_reasons`, `fix_priorities`, optional `diff_context`) |
| `--markdown` | Output PR-ready markdown trust summary |
| `--output <file>` | Write selected trust output format to file |
| `--min-trust <n>` | Exit code 1 when trust score is below `n` |
| `--max-risk <level>` | Exit code 1 when computed merge risk exceeds `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL` |
| `--branch <name>` | Branch used for `drift.config` trust policy matching (falls back to CI env vars) |
| `--policy-pack <name>` | Optional trust policy pack from `trustGate.policyPacks` in `drift.config.*` |
| `--explain-policy` | Print base/pack/branch/override resolution and effective gate policy to stderr |
| `--advanced-trust` | Enable optional advanced trust layer (historical comparison + team guidance metadata) |
| `--previous-trust <file>` | Compare current trust against a prior trust JSON file in advanced mode |
| `--history-file <file>` | Use a specific `drift-history.json` file for advanced historical fallback |

When `trustGate` policy is configured in `drift.config.*`, branch-based thresholds are applied automatically. CLI flags still override policy values.

---

### `drift trust-gate <trust-json-file>`

Evaluate trust gate thresholds from a previously generated trust JSON file. This is ideal for CI workflows that already produced `drift-trust.json` and want a single source of truth for gate logic.

```bash
drift trust-gate drift-trust.json --min-trust 45 --max-risk HIGH
drift trust-gate drift-trust.json --branch release/v1.2.0
drift trust-gate drift-trust.json --branch main --policy-pack balanced --explain-policy
```

| Flag | Description |
|------|-------------|
| `--min-trust <n>` | Exit code 1 when trust score in JSON is below `n` |
| `--max-risk <level>` | Exit code 1 when merge risk in JSON exceeds `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL` |
| `--branch <name>` | Branch used for `drift.config` trust policy matching (falls back to CI env vars) |
| `--policy-pack <name>` | Optional trust policy pack from `trustGate.policyPacks` in `drift.config.*` |
| `--explain-policy` | Print base/pack/branch/override resolution and effective gate policy to stderr |

---

### `drift kpi <path>`

Aggregate trust KPI evidence from local artifacts (directory or glob). Prints a compact console summary to stderr and structured KPI JSON to stdout.

```bash
drift kpi ./artifacts/trust
drift kpi "./artifacts/**/drift-trust-*.json"
drift kpi ./artifacts/trust --no-summary
```

| Flag | Description |
|------|-------------|
| `--no-summary` | Disable stderr console summary and output JSON only |

Computed KPI fields include:
- PRs evaluated count
- Merge risk distribution (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
- Trust score average/median/min/max
- High-risk ratio (`HIGH` + `CRITICAL`)
- Diff trend aggregates when `diff_context` exists (`scoreDelta`, new/resolved issues, status distribution)
- Diagnostics for malformed/missing/invalid JSON artifacts

---

### `drift map [path]`

Generate an `architecture.svg` map with inferred layer dependencies. When layer config is present, the SVG also highlights cycle edges and layer violations.

```bash
drift map
drift map ./src
drift map ./src --output docs/architecture.svg
```

| Flag | Description |
|------|-------------|
| `--output <file>` | Output path for the SVG file (default: `architecture.svg`) |

Edge legend in SVG:
- Gray: normal dependency
- Orange: cycle edge
- Red: layer violation edge

---

### `drift report [path]`

Generate a self-contained HTML report. No server required — open in any browser.

```bash
drift report              # scan current directory
drift report ./src        # scan specific path
drift report ./src --output my-report.html
```

**Options:**

| Flag | Description |
|------|-------------|
| `--output <file>` | Output path for the HTML file (default: `drift-report.html`) |

All styles and data are embedded inline in the output file.

---

### `drift badge [path]`

Generate a `badge.svg` with the current score, compatible with shields.io style.

```bash
drift badge               # writes badge.svg to current directory
drift badge ./src
drift badge ./src --output ./assets/drift-badge.svg
```

**Options:**

| Flag | Description |
|------|-------------|
| `--output <file>` | Output path for the SVG file (default: `badge.svg`) |

Add the badge to your README — see [README Badge](#readme-badge).

---

### `drift ci [path]`

Emit GitHub Actions annotations and a step summary. Designed to run inside a CI workflow.

```bash
drift ci                  # scan current directory
drift ci ./src
drift ci ./src --format sarif
drift ci ./src --min-score 60
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format <type>` | Output format: `console\|json\|sarif` |
| `--min-score <n>` | Exit with code 1 if the overall score strictly exceeds this threshold |

Outputs `::error` and `::warning` annotations visible in the PR diff. Writes a markdown summary to `$GITHUB_STEP_SUMMARY`.

---

### `drift trend [period]`

Show score evolution over time. `period` accepts: `week`, `month`, `quarter`, `year`.

```bash
drift trend week
drift trend month
drift trend quarter --since 2025-01-01
drift trend year --until 2025-12-31
```

**Options:**

| Flag | Description |
|------|-------------|
| `--since <date>` | Start date for the trend window (ISO 8601) |
| `--until <date>` | End date for the trend window (ISO 8601) |

---

### `drift blame [target]`

Identify which files, rules, or contributors are responsible for the most debt. `target` accepts: `file`, `rule`, `overall`.

```bash
drift blame file          # top files by score
drift blame rule          # top rules by frequency
drift blame overall
drift blame file --top 10
```

**Options:**

| Flag | Description |
|------|-------------|
| `--top <n>` | Limit output to top N results (default: 5) |

---

### `drift fix [path]`

Auto-fix safe issues with explicit preview/write modes.

```bash
drift fix ./src --preview
drift fix ./src --write
drift fix ./src --write --yes
drift fix ./src --dry-run   # alias of --preview
```

| Flag | Description |
|------|-------------|
| `--preview` | Preview before/after without writing files |
| `--write` | Apply fixes to disk |
| `--dry-run` | Backward-compatible alias for preview mode |
| `--yes` | Skip interactive confirmation for write mode |

---

### `drift cloud`

Local multi-tenant foundations backed by `.drift-cloud/store.json`.

```bash
drift cloud ingest ./src --org acme --workspace core --user u-123 --role owner --plan sponsor --repo webapp
drift cloud summary
drift cloud summary --org acme --workspace core
drift cloud summary --org acme --workspace core --actor u-owner
drift cloud ingest ./src --org acme --workspace core --user u-member --actor u-owner
drift cloud ingest ./src --org acme --workspace core --user u-member --actor u-member # strict actor mode ready
drift cloud plan-set --org acme --plan team --actor u-owner --reason "annual upgrade"
drift cloud plan-changes --org acme --actor u-owner
drift cloud usage --org acme --actor u-owner
drift cloud summary --json
drift cloud dashboard --output drift-cloud-dashboard.html
```

**Subcommands:**

| Command | Description |
|---------|-------------|
| `drift cloud ingest [path] --org <id> --workspace <id> --user <id> [--role <owner\|member\|viewer>] [--plan <free\|sponsor\|team\|business>] [--repo <name>] [--actor <user>] [--store <file>]` | Scans the path and stores one tenant-scoped snapshot (`--actor` optional by default, required only when `saas.strictActorEnforcement=true`) |
| `drift cloud summary [--json] [--org <id>] [--workspace <id>] [--actor <user>] [--store <file>]` | Shows users/workspaces/repos usage and runs per month; in strict mode, scoped reads (`--org`/`--workspace`) require `--actor` |
| `drift cloud plan-set --org <id> --plan <free\|sponsor\|team\|business> --actor <user> [--reason <text>] [--store <file>]` | Updates organization plan and writes an audited plan-change event (owner-gated by actor) |
| `drift cloud plan-changes --org <id> --actor <user> [--json] [--store <file>]` | Lists audited plan lifecycle events for the organization |
| `drift cloud usage --org <id> --actor <user> [--month <yyyy-mm>] [--json] [--store <file>]` | Shows organization usage plus effective limits for current plan |
| `drift cloud dashboard [--output <file>] [--store <file>]` | Generates an HTML dashboard with trends and hotspots |

`drift cloud` ships with tenant identity boundaries (`organizationId` + `workspaceId`), role primitives (`owner`/`member`/`viewer`), and plan placeholders (`free`/`sponsor`/`team`/`business`). It is an infrastructure foundation, not a full auth/billing platform.

By default, local guardrails enforce one plan-based limit: max workspaces per organization (`free:20`, `sponsor:50`, `team:200`, `business:1000`), plus existing free-phase limits (runs per workspace, repos per workspace, retention window).

To require actor identity on scoped cloud operations, enable strict actor mode in `drift.config.*`:

```ts
export default {
  saas: {
    strictActorEnforcement: true,
  },
}
```

---

## Rules

drift currently defines **35 rule IDs** in `RULE_WEIGHTS` (`src/analyzer.ts`): core detections, configurable architecture checks, AI/meta aggregation, plugin diagnostics, and analysis guardrail diagnostics.

For the complete up-to-date catalog (id, severity, weight, phase/origin, note), see [`docs/rules-catalog.md`](./docs/rules-catalog.md).

Highlights:

| Rule | Severity | Weight | What it detects |
|------|----------|--------|-----------------|
| `large-file` | error | 20 | Files exceeding 300 lines |
| `duplicate-function-name` | error | 18 | Same function name repeated across a file |
| `high-complexity` | error | 15 | Cyclomatic complexity above threshold |
| `layer-violation` | error | 16 | Invalid layer import direction (requires `layers` config) |
| `cross-boundary-import` | warning | 10 | Invalid module boundary import (requires `modules`/legacy boundaries config) |
| `controller-no-db` | warning | 11 | Controller touching DB directly (configurable architecture rule) |
| `service-no-http` | warning | 11 | Service layer coupled to HTTP concerns (configurable architecture rule) |
| `max-function-lines` | warning | 9 | Function line cap enforced by `architectureRules.maxFunctionLines` |
| `semantic-duplication` | warning | 12 | AST-level semantic function duplication |
| `ai-code-smell` | warning | 12 | Aggregated AI-smell signal from multiple heuristics in a file |
| `plugin-error` | warning | 4 | Plugin load/contract/runtime failure surfaced as issue |
| `plugin-warning` | info | 0 | Non-fatal plugin validation warning |
| `analysis-skip-max-files` | info | 0 | File skipped by `maxFiles` guardrail |
| `analysis-skip-file-size` | info | 0 | File skipped by `maxFileSizeKb` guardrail |

---

## Score

**Calculation:** For each file, drift sums the weights of all detected issues, capped at 100. The project score is the average across all scanned files.

| Score | Grade | Meaning |
|-------|-------|---------|
| 0 | CLEAN | No issues found |
| 1–19 | LOW | Minor issues — safe to ship |
| 20–44 | MODERATE | Worth a review before merging |
| 45–69 | HIGH | Significant structural debt detected |
| 70–100 | CRITICAL | Review before this goes anywhere near production |

---

## Configuration

drift runs with zero configuration. Architectural rules (`layer-violation`, `cross-boundary-import`) and configurable architecture checks use `drift.config.ts` (or `.js` / `.json`) at project root:

```typescript
import type { DriftConfig } from '@eduardbar/drift'

export default {
  plugins: ['drift-plugin-example'],
  performance: {
    lowMemory: true,
    chunkSize: 40,
    maxFiles: 8000,
    maxFileSizeKb: 1024,
    includeSemanticDuplication: false,
  },
  architectureRules: {
    controllerNoDb: true,
    serviceNoHttp: true,
    maxFunctionLines: 80,
  },
  trustGate: {
    minTrust: 45,
    maxRisk: 'HIGH',
    presets: [
      { branch: 'main', minTrust: 70, maxRisk: 'MEDIUM' },
      { branch: 'release/*', minTrust: 80, maxRisk: 'LOW' },
      { branch: 'legacy/*', enabled: false },
    ],
  },
  layers: [
    { name: 'domain',  patterns: ['src/domain/**'],  canImportFrom: [] },
    { name: 'app',     patterns: ['src/app/**'],     canImportFrom: ['domain'] },
    { name: 'infra',   patterns: ['src/infra/**'],   canImportFrom: ['domain', 'app'] },
  ],
  modules: [
    { name: 'auth',    root: 'src/modules/auth',    allowedExternalImports: ['src/shared'] },
    { name: 'billing', root: 'src/modules/billing', allowedExternalImports: ['src/shared'] },
  ],
} satisfies DriftConfig
```

For backwards compatibility, `moduleBoundaries` and `boundaries` are normalized to `modules`.

Without a config file, `layer-violation`, `cross-boundary-import`, and configurable architecture checks (`controller-no-db`, `service-no-http`, `max-function-lines`) are skipped. All other rules run with defaults.

### Memory guardrails (recommended for large repos)

If your repository is large or your machine has limited RAM, start with:

```bash
drift scan . --low-memory --max-file-size-kb 1024 --max-files 8000
```

Practical tuning:
- Lower `--chunk-size` to reduce peak memory further (slower but safer).
- Keep `includeSemanticDuplication: false` in low-memory mode for the lowest memory footprint.
- Set `maxFileSizeKb` to skip generated/vendor files that can explode AST memory usage.
- Set `maxFiles` to protect CI runners from worst-case monorepo scans.

---

## CI Integration

### Basic gate with `scan`

```yaml
name: Drift

on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Check debt score
        run: npx @eduardbar/drift scan ./src --min-score 60
```

Exit code is `1` if the score is strictly greater than `--min-score`. Exit code `0` otherwise.

### Annotations and step summary with `drift ci`

```yaml
name: Drift

on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run drift
        run: npx @eduardbar/drift ci ./src --min-score 60
```

`drift ci` emits `::error` and `::warning` annotations that appear inline in the PR diff and writes a formatted summary to `$GITHUB_STEP_SUMMARY`. Use this when you want visibility beyond a pass/fail exit code.

### Required quality checks for merge and release

This repository enforces `.github/workflows/quality.yml` on `pull_request` and `push` to `main`/`master`.

The workflow runs a required Node.js matrix (`20`, `22`) and executes these checks in each matrix job:
- `npm ci`
- `npm run check:runtime-policy`
- `npm run check:docs-drift`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run smoke:repo -- --base HEAD --out .drift-smoke/ci-node-<node>`

Additionally, Node 20 runs a deterministic performance regression gate:
- `npm run check:perf-budget -- --out .drift-perf/ci-node-20/benchmark-latest.json`
- Budget source of truth: [`benchmarks/perf-budget.v1.json`](./benchmarks/perf-budget.v1.json)

`check:docs-drift` enforces documentation source-of-truth contracts: package version claims come from `package.json` and rule catalog/count claims come from `RULE_WEIGHTS` in `src/analyzer.ts`.

Coverage artifacts and smoke E2E artifacts are uploaded from each matrix run to support traceability and CI debugging. The perf gate also uploads `.drift-perf/...` artifacts on Node 20.

`publish.yml` now runs `release-verify` before publish, reusing the same quality workflow contract. `publish` only runs after `release-verify` passes.

### Auto PR comment with `drift review`

The repository includes `.github/workflows/review-pr.yml`, which:
- generates a PR-ready markdown comment with `drift trust --markdown` first and `drift review --comment` as supplementary context
- updates a single sticky comment (`<!-- drift-review -->`) on non-fork PRs
- falls back to `$GITHUB_STEP_SUMMARY` for fork PRs
- enforces a trust baseline gate with `drift trust-gate drift-trust.json --min-trust 45 --max-risk HIGH`
- uploads `drift trust --json` as `drift-trust-json-pr-<PR_NUMBER>-run-<RUN_ATTEMPT>` for manual KPI tracking
- publishes a compact trust KPI summary in `$GITHUB_STEP_SUMMARY` (score, merge risk, new/resolved issues when diff context is available)
- generates `drift.sarif` via `drift scan --format sarif`, uploads it to GitHub Code Scanning on non-fork PRs, and stores the SARIF file as workflow artifact for traceability

Quick local SARIF export:

```bash
drift scan ./src --format sarif > drift.sarif
```

Example GitHub Code Scanning upload with SARIF:

```yaml
- name: Generate drift SARIF
  run: npx @eduardbar/drift scan ./src --format sarif > drift.sarif

- name: Upload SARIF to Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: drift.sarif
```

Default gate behavior in this repo:
- fail when trust is below 45
- fail when merge risk is above `HIGH` (that means `CRITICAL` is blocked)

### GitHub Action contract (v2)

This repo also ships reusable local composite actions:

- `./.github/actions/drift-scan`: score-focused scan gate using `npx @eduardbar/drift@<version>` (no global install).
- `./.github/actions/drift-review`: trust/review/gate flow for PRs, aligned with `.github/workflows/review-pr.yml`.

`drift-scan` exposes machine-friendly outputs for CI composition:
- `score`, `grade`, `errors`, `warnings`, `infos`, `total-issues`, `files-affected`, `top-rules`

`drift-review` exposes:
- `trust-score`, `merge-risk`, `new-issues`, `resolved-issues`, `trust-json`, `trust-markdown`, `review-markdown`

See `.github/actions/drift-scan/README.md` and `.github/actions/drift-review/README.md` for usage details.

---

## drift-ignore

### Suppress a single issue

Add `// drift-ignore` at the end of the flagged line or on the line immediately above it:

```typescript
console.log(debugPayload) // drift-ignore
```

```typescript
// drift-ignore
const result: any = parse(input)
```

### Suppress an entire file

Add `// drift-ignore-file` anywhere in the first 10 lines of the file:

```typescript
// drift-ignore-file
// This file contains intentional console output — not debug leftovers.
```

When `drift-ignore-file` is present, `analyzeFile()` returns an empty report with score 0 for that file. Use this for files like loggers or CLI printers where `console.*` calls are intentional.

---

## README Badge

Generate a badge from your project score and add it to your README:

```bash
drift badge . --output ./assets/drift-badge.svg
```

Then reference it in your README:

```markdown
![drift score](./assets/drift-badge.svg)
```

The badge uses shields.io-compatible styling and color-codes automatically by grade: green for LOW, yellow for MODERATE, orange for HIGH, red for CRITICAL.

---

## Contributing

Open an issue before starting significant work. Check [existing issues](https://github.com/eduardbar/drift/issues) first — use the bug report or feature request templates.

**To add a new detection rule:**

1. Create a branch: `git checkout -b feat/rule-name`
2. Add `"rule-name": <weight>` to `RULE_WEIGHTS` in `src/analyzer.ts`
3. Implement AST detection logic using ts-morph in `analyzeFile()`
4. Add a `fix_suggestion` entry in `src/printer.ts`
5. Update the rules table in `README.md` and `AGENTS.md`
6. Open a PR using the template in `.github/PULL_REQUEST_TEMPLATE.md`

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

---

## Stack

| Package | Role |
|---------|------|
| [`ts-morph`](https://github.com/dsherret/ts-morph) | AST traversal and TypeScript analysis |
| [`commander`](https://github.com/tj/commander.js) | CLI commands and flags |
| [`kleur`](https://github.com/lukeed/kleur) | Terminal colors (zero dependencies) |

**Runtime:** Node.js 20.x and 22.x (LTS) · TypeScript 5.x · ES Modules · Supports TypeScript (`.ts`, `.tsx`) and JavaScript (`.js`, `.jsx`) files

---

## License

MIT © [eduardbar](https://github.com/eduardbar)
