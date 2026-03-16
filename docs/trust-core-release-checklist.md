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

- [ ] Open or update a non-fork PR and confirm `.github/workflows/review-pr.yml` runs successfully.
- [ ] Confirm sticky PR comment is updated once (marker: `<!-- drift-review -->`).
- [ ] Confirm PR comment includes both sections in this order: `drift trust` then `drift review`.
- [x] E2E: `trust-gate` runs from generated `drift-trust.json` in `review-pr` workflow.
- [x] E2E: `kpi` aggregates over generated trust JSON artifact (`drift-trust-kpi.json`).
- [x] E2E: `drift-trust-json-pr-<PR_NUMBER>-run-<RUN_ATTEMPT>` artifact now bundles:
  - `drift-trust.json`
  - `drift-trust-gate.txt`
  - `drift-trust-kpi.json`
- [ ] Confirm step summary shows trust KPI values: trust score, merge risk, new issues, resolved issues.
- [x] E2E: step summary includes aggregate KPI block (matched/parsed/malformed, PR samples, avg trust, high-risk ratio).

Smoke PR runbook:

- [ ] Create a short-lived branch (for example `chore/trust-ci-smoke`) with a docs-only change.
- [ ] Open a PR against `master` and wait for `review-pr` workflow to complete.
- [ ] Verify gate behavior and comment rendering, then close or merge the PR.
- [ ] Delete the short-lived branch after validation.

## 3) Gate behavior acceptance

Default trust gate for this milestone:

- `--min-trust 40`
- `--max-risk HIGH`

Checks:

- [x] PR fails when trust score is below 40.
- [x] PR fails when merge risk is `CRITICAL`.
- [x] PR passes when trust score is 40+ and merge risk is `LOW`, `MEDIUM`, or `HIGH`.

## 4) Narrative and docs acceptance

- [x] `README.md` positions drift as an AI Code Audit CLI for merge trust in AI-assisted PRs.
- [x] `package.json` description matches the same positioning.
- [x] `src/cli.ts` program description matches the same positioning.
- [x] `ROADMAP.md` no longer contradicts PRD on core vs premium direction.
