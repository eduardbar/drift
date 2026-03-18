# Trust Core Tonight - Release Checklist

Use this checklist before releasing the trust-core milestone.

## 1) Local validation

- [x] `npm ci`
- [x] `npm test`
- [x] `npx --no-install tsx ./src/cli.ts trust . --base origin/master --markdown`
- [x] `npx --no-install tsx ./src/cli.ts trust . --base origin/master --json-output drift-trust.json`
- [x] `npx --no-install tsx ./src/cli.ts trust-gate drift-trust.json --min-trust 40 --max-risk HIGH`
- [x] `npx --no-install tsx ./src/cli.ts review --base origin/master --comment`

## 2) CI workflow validation

- [x] Open or update a non-fork PR and confirm `.github/workflows/review-pr.yml` runs successfully.
- [x] Confirm sticky PR comment is updated once (marker: `<!-- drift-review -->`).
- [x] Confirm PR comment includes both sections in this order: `drift trust` then `drift review`.
- [x] E2E: `trust-gate` runs from generated `drift-trust.json` in `review-pr` workflow.
- [x] E2E: `kpi` aggregates over generated trust JSON artifact (`drift-trust-kpi.json`).
- [x] E2E: `drift-trust-json-pr-<PR_NUMBER>-run-<RUN_ATTEMPT>` artifact now bundles:
  - `drift-trust.json`
  - `drift-trust-gate.txt`
  - `drift-trust-kpi.json`
- [x] Confirm step summary shows trust KPI values: trust score, merge risk, new issues, resolved issues.
- [x] E2E: step summary includes aggregate KPI block (matched/parsed/malformed, PR samples, avg trust, high-risk ratio).

Smoke PR runbook:

- [x] Create a short-lived branch (for example `chore/trust-ci-smoke`) with a docs-only change.
- [x] Open a PR against `master` and wait for `review-pr` workflow to complete.
- [x] Verify gate behavior and comment rendering, then close or merge the PR.
- [x] Delete the short-lived branch after validation.

## 3) Gate behavior acceptance

Default trust gate for this milestone:

- `--min-trust 40`
- `--max-risk HIGH`

Checks:

- [x] PR fails when trust score is below 40.
- [x] PR fails when merge risk is `CRITICAL`.
- [x] PR passes when trust score is 40+ and merge risk is `LOW`, `MEDIUM`, or `HIGH`.

Calibration evidence from docs-only smoke runs: trust score 49 (PR #11), 46 (PR #12), 41 (PR #13). Gate floor set to 40 to avoid false negatives while still blocking `CRITICAL` risk.

## 4) Narrative and docs acceptance

- [x] `README.md` positions drift as an AI Code Audit CLI for merge trust in AI-assisted PRs.
- [x] `package.json` description matches the same positioning.
- [x] `src/cli.ts` program description matches the same positioning.
- [x] `ROADMAP.md` no longer contradicts PRD on core vs premium direction.

## 5) SARIF and action v2 readiness

- [x] `scan --format sarif` emits valid SARIF payload with drift rule mapping.
- [x] `ci --format sarif` emits SARIF without requiring GitHub annotation mode.
- [x] `diff --format sarif` emits SARIF from `DriftDiff` output.
- [x] `review --format sarif` emits SARIF from review diff context.
- [x] `trust --format sarif` emits SARIF based on current trust scan report.
- [x] CI workflow uploads SARIF artifact in PR runs.
- [x] Action v2 contracts are aligned with SARIF-capable commands and outputs.

## 6) Trust artifacts and KPI readiness

- [x] Trust command supports split outputs (`--json-output` + selected stdout format).
- [x] Artifact bundle includes trust JSON, gate result, and trust KPI aggregate.
- [x] `drift kpi` parses trust artifacts and prints JSON plus optional summary.
- [x] Trust gate policy behavior documented and calibrated for current milestone.

## 7) Quick smoke runbook (no build)

Run from repository root:

- [x] `node --import tsx ./src/cli.ts scan . --format sarif > .tmp/smoke-scan.sarif`
- [x] `node --import tsx ./src/cli.ts ci . --format sarif > .tmp/smoke-ci.sarif`
- [x] `node --import tsx ./src/cli.ts trust . --format sarif > .tmp/smoke-trust.sarif`
- [x] `node --import tsx ./src/cli.ts review --base HEAD~1 --format sarif > .tmp/smoke-review.sarif`

Validation hints:

- Check each command exits with code `0`.
- Check each `.sarif` file starts with `{"$schema"` and contains `"runs"`.
- Keep smoke artifacts out of release commit unless explicitly needed.
