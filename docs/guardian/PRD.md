# Drift Guardian — Product Requirement Document (PRD)

**Status:** Draft v1
**Product:** Drift Guardian (sub-command `drift guardian`, plus GitHub Action `eduardbar/drift-guardian`)
**Base product:** [drift](https://github.com/eduardbar/drift) v1.7.0
**Audience:** Product, Engineering, Open Source maintainers

---

## 1. Product summary

### 1.1 What it is

Drift Guardian answers one question before merge:

> "Does this change — especially one generated or assisted by AI — respect the repository's architecture, policies, and restrictions?"

It is a **deterministic policy gate** for git diffs. Guardian runs as part of the existing
`drift` CLI, as a GitHub Action, through MCP, and in CI. It evaluates the *change* (not the whole
codebase) against the repository's own rules:

- architectural boundaries (layers, modules);
- forbidden dependencies;
- protected/sensitive paths;
- potential breaking public API changes;
- repository policy violations.

Every rule is enforced by deterministic analysis. **The AI layer is optional and advisory only.**
The LLM explains, summarizes, and reasons about findings — it never decides whether a rule passed.

### 1.2 Problem it solves

Modern development is increasingly AI-assisted. AI coding agents produce large diffs quickly,
with a high *appearance* of correctness. Human reviewers face a surge of changes they did not
write, cannot fully recall, and must evaluate for architectural compliance that is not written
down anywhere.

The pain is specific:

1. **Architecture rules exist implicitly.** Teams know "presentation must not import
   infrastructure", but nothing enforces it; it lives in review comments.
2. **AI-generated changes are plausible.** They compile, they pass unit tests, and they violate
   boundaries that a reviewer must manually re-derive.
3. **CI gates are code-centric.** Type checks, lints, and tests verify *behavior*, not *policy*.
   Nothing checks "did this PR touch `migrations/`?" or "did this PR change a public API?"
4. **AI review tools are probabilistic.** An AI code reviewer gives opinions. Merge trust needs
   *deterministic* guarantees plus optional explanatory context.

### 1.3 Target users

| Persona | Relationship to Guardian |
| --- | --- |
| Open source maintainer | Enforces repo policies on contributors' PRs without hosting anything. |
| Backend developer | Gets instant, local feedback on their diff before pushing. |
| Platform engineer | Configures policies once; rolls them out across repos via the Action. |
| Engineering lead | Gets a merge-trust signal for AI-assisted PRs and tracks policy drift over time. |
| Team using AI coding agents | Feeds findings back to the agent loop: change → guard → repair → re-check. |
| Organization with architecture policies | Encodes architecture decision records (ADRs) into executable rules. |

### 1.4 Why a traditional AI code reviewer is not enough

A traditional AI code reviewer:

- has **no enforceable semantics** — it flags, suggests, and opines; it does not gate;
- **cannot be trusted to gate merges** — probabilistic output cannot be the authority for policy;
- **re-reads the diff with no architectural context** unless context is carefully injected;
- **lacks git/architectural ground truth** — it does not know your layers, modules, protected paths;
- **cannot be versioned as policy** — there is no reviewable, diffable rules file.

Guardian inverts the architecture:

> **Deterministic enforcement is the authority. AI review is an explanation layer.**

The deterministic engine answers *did the change violate a rule?* with yes/no and location.
The AI layer answers *why does this matter, what tests are missing, what breaks?*

### 1.5 Deterministic enforcement vs. probabilistic AI review

| Dimension | Deterministic enforcement | Probabilistic AI review |
| --- | --- | --- |
| Authority | Decides pass/warn/fail | Advisory explanation |
| Repeatability | Same diff → same result | Variance between runs |
| Cost | $0, local | Token cost, BYOK |
| Reviewability | Rules file in git, diffable | Output is text |
| Failure mode | False positives (configurable) | Hallucinated reasoning |
| Speed | Milliseconds | Seconds |
| Use | CI gate, exit codes | PR comments, developer education |

Guardian treats these as **complementary layers with a strict dependency**: AI review never
runs without the deterministic engine, and its output is labeled as advisory.

---

## 2. Personas

### 2.1 Open source maintainer

- Owns a public repo, receives PRs from unknown contributors and AI agents.
- Wants policy in a committed file (`drift.guard.yml`) so contributors can see the rules.
- Wants a zero-infrastructure GitHub Action that blocks merges on violations.
- Rejects tools that require a SaaS account or send their code to a third party.

### 2.2 Backend developer

- Wants local feedback before pushing: `drift guardian .`
- Wants to understand *why* a finding exists and how to fix it.
- Does not want to learn a new config language for every tool.

### 2.3 Platform engineer

- Maintains the policy file for many repos; needs `version`, validation, and predictable exit codes.
- Wants the same policy in CI and locally (no drift between environments).

### 2.4 Engineering lead

- Uses Guardian as a merge-trust signal for AI-assisted PRs.
- Reads the AI review (PR summary, missing tests) to triage large diffs quickly.
- Uses SARIF output to surface findings in GitHub code scanning.

### 2.5 Team using AI coding agents

- Agent produces a diff → developer runs Guardian locally or in CI → findings return to the agent
  loop → agent repairs → Guardian re-checks. Fast iteration with a hard policy floor.

### 2.6 Organization with architecture policies

- Encodes ADRs/layer rules into `drift.guard.yml`.
- Treats the rules file as the executable form of the architecture decision.
- Requires `.aiignore` guarantees: sensitive files are never sent to an AI provider.

---

## 3. Core use cases

### 3.1 Local pre-push check

```bash
drift guardian .                      # uncommitted changes vs HEAD
drift guardian --base main            # changes between main..HEAD
drift guardian --staged               # staged changes only
drift guardian --diff-file pr.diff    # any external unified diff
```

Exit codes: `0` pass, `1` policy violation, `2` input/configuration error (same convention as `drift ai-guard`).

### 3.2 CI gate (GitHub Actions)

```yaml
- uses: eduardbar/drift-guardian@v1
  with:
    base: ${{ github.event.pull_request.base.sha }}
    format: sarif
    upload-sarif: true
```

The Action fails the check when a `blocking`/`error` finding is produced.

### 3.3 Structured output

```bash
drift guardian --format json
drift guardian --format sarif        # SARIF 2.1.0, ready for code scanning
drift guardian --format github       # GitHub annotations (CI)
```

### 3.4 MCP / agent loop

The `drift mcp` server exposes a Guardian tool: an AI coding agent obtains architectural context,
makes changes, asks Guardian for findings, repairs, and re-checks until clean.

### 3.5 Policy authoring

```bash
drift guardian init                  # scaffolds drift.guard.yml from repo introspection
```

---

## 4. MVP capabilities

Deterministic (no LLM required):

- [x] Collect git diff (stdin / staged / base ref / diff file / working tree).
- [x] Identify modified files with per-file line stats and hunks.
- [x] Reuse Drift's AST (`ts-morph`), dependency-graph detection, and layer/module config.
- [x] Execute architectural policies (layers, module boundaries).
- [x] Detect forbidden dependencies (from/to rules).
- [x] Detect layer violations.
- [x] Detect protected/sensitive path changes (glob patterns).
- [x] Detect potential breaking public API changes (added/removed exported symbols, signature changes).
- [x] Structured findings with severity, location, rule, evidence.
- [x] Output: human terminal, JSON, SARIF 2.1.0.
- [x] CI-ready exit codes.

AI-assisted (optional, advisory, BYOK):

- [ ] Architectural risk explanation for findings.
- [ ] Missing-test reasoning.
- [ ] Behavioral-risk assessment.
- [ ] PR summary generation.
- [ ] Structured outputs with schema validation.

---

## 5. AI-assisted capabilities

The AI layer is a **post-processor**. Its input is the deterministic `GuardianResult` plus a
carefully scoped context; its output is `AIReview` (structured). The LLM:

- **never** changes a verdict;
- **never** disables a rule;
- **never** sees excluded/sensitive content (`.aiignore`, plus automatic secret redaction);
- always receives a bounded, deterministic context (diff of affected files, rule descriptions,
  findings) — not the whole repository.

Capabilities:

1. **Architectural risk explanation** — for each finding, why the violation matters in plain language.
2. **Missing test reasoning** — which changed functions/APIs lack test coverage and what to test.
3. **Behavioral risk** — consequences of the change beyond static rules.
4. **PR summary** — a merge-ready summary of the change and its risks.

Providers are pluggable (OpenAI, Anthropic, Ollama, future), selected by configuration, never
hard-coupled in the core. See TRD §7.

---

## 6. Configuration

Canonical file: `drift.guard.yml` at the repository root. A `drift guardian init` command
scaffolds it. Schema is defined in the TRD (§4) and validated with a typed parser.

Conceptual shape (the authoritative schema lives in `docs/guardian/TRD.md`):

```yaml
version: 1

architecture:
  rules:
    - from: presentation
      cannot_depend_on:
        - infrastructure

protected_paths:
  - src/auth/**
  - migrations/**

ai:
  enabled: true
  review:
    architecture: true
    missing_tests: true
    behavior: true
```

Configuration precedence (low → high): built-in defaults → `drift.guard.yml` → `drift.config.ts`
`guardian` section (optional) → CLI flags.

---

## 7. Non-goals for the MVP

Explicitly out of scope:

- **Full IDE extension** — VS Code extension exists for drift; Guardian CLI + Action first.
- **SaaS / multi-tenant platform** — Guardian is local-first; no central server, no billing.
- **Billing / metering** — nothing to meter in MVP.
- **Model training** — no fine-tuning, no data collection.
- **Replacing SAST** — Guardian enforces *architectural policy*; it is not a CVE/security scanner.
- **Replacing unit/integration tests** — Guardian validates policy, not behavior.
- **Central database** — no DB in MVP (see `BACKEND_SCHEMA.md`).

---

## 8. Launch metrics

| Metric | Target |
| --- | --- |
| Install → first analysis | < 5 minutes (npm i + `drift guardian init` + run) |
| False positive rate | < 10% of findings on default rules (measured via issue reports) |
| Analysis time | < 2 s for diffs ≤ 500 changed lines on typical repos |
| Supported projects | TypeScript/JavaScript repos on Node 20/22 (drift's existing contract) |
| Rule coverage | ≥ 4 rule categories at MVP: architecture, dependency, protected-path, api-change |
| GitHub Action adoption | ≥ 25 external repos in first quarter after release |
| AI adoption | ≥ 15% of users enable AI review (BYOK) |

---

## 9. Open source strategy

- **Extensibility**: Guardian rules are data (config) first; custom rule modules follow the
  existing drift plugin contract (`.github/actions/drift-scan` + `src/plugins.ts` precedent).
- **Contribution model**: `CONTRIBUTING.md` (existing) + labeled `good first issue` tasks for each
  rule category; docs-driven onboarding via this folder.
- **Good first issues**: parse `drift.guard.yml`, add rule X, add reporter Y, provider Z, test
  fixtures.
- **Plugin / policy packs**: versioned, reusable bundles of rules (e.g. `pack:backend-service`,
  `pack:frontend-layers`, `pack:open-source-release`) that a repo can `include` instead of
  hand-writing rules.
- **Community policies roadmap**:
  1. Publish policy-pack format + docs.
  2. `drift guardian pack <name>` fetches a community pack.
  3. Registry of reviewed packs under the drift org.
- **Local-first guarantee**: all deterministic analysis runs offline; AI is opt-in BYOK. The
  project never operates a paid analysis service (the existing `cloud` command remains a
  separate opt-in surface).
