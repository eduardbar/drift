# Trust Core Tonight - Release Checklist

Use this checklist before releasing the trust-core milestone.

## 1) Local validation

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npx @eduardbar/drift trust . --base origin/main --markdown`
- [ ] `npx @eduardbar/drift trust . --base origin/main --json`
- [ ] `npx @eduardbar/drift review --base origin/main --comment`

## 2) CI workflow validation

- [ ] Open or update a non-fork PR and confirm `.github/workflows/review-pr.yml` runs successfully.
- [ ] Confirm sticky PR comment is updated once (marker: `<!-- drift-review -->`).
- [ ] Confirm PR comment includes both sections in this order: `drift trust` then `drift review`.
- [ ] Confirm `drift-trust-<PR_NUMBER>` artifact exists and contains `drift-trust.json`.

Smoke PR runbook:

- [ ] Create a short-lived branch (for example `chore/trust-ci-smoke`) with a docs-only change.
- [ ] Open a PR against `master` and wait for `review-pr` workflow to complete.
- [ ] Verify gate behavior and comment rendering, then close or merge the PR.
- [ ] Delete the short-lived branch after validation.

## 3) Gate behavior acceptance

Default trust gate for this milestone:

- `--min-trust 65`
- `--max-risk MEDIUM`

Checks:

- [ ] PR fails when trust score is below 65.
- [ ] PR fails when merge risk is `HIGH` or `CRITICAL`.
- [ ] PR passes when trust score is 65+ and merge risk is `LOW` or `MEDIUM`.

## 4) Narrative and docs acceptance

- [ ] `README.md` positions drift as an AI Code Audit CLI for merge trust in AI-assisted PRs.
- [ ] `package.json` description matches the same positioning.
- [ ] `src/cli.ts` program description matches the same positioning.
- [ ] `ROADMAP.md` no longer contradicts PRD on core vs premium direction.
