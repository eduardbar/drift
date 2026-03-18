# Release Notes Draft (S5)

## Scope

This draft covers the latest trust-core and SARIF-related changes prepared for release packaging.

## What changed

- Added/solidified release-facing CLI capabilities:
  - `init` for project scaffolding and baseline bootstrap.
  - `doctor` for environment diagnostics.
  - `guard` for non-regression enforcement by diff or baseline.
- Consolidated output format behavior around `--format` and preserved legacy aliases for compatibility.
- Added SARIF output coverage across critical commands (`scan`, `ci`, `diff`, `review`, `trust`).
- Aligned CI and action v2 contract expectations with SARIF-enabled workflows.
- Expanded tests and docs to reduce release risk in CLI output contracts.

## User impact

- Teams can ingest drift findings in SARIF-native tooling without custom adapters.
- Trust/review automation in PRs is more consistent thanks to normalized output contracts.
- Onboarding and guardrail setup are faster with `init`, `doctor`, and `guard`.

## Risks and watch points

- SARIF consumers may still differ in strictness; validate in at least one real CI environment.
- Legacy alias paths (`--json`, `--comment`, `--markdown`) depend on compatibility behavior and should remain covered by tests.
- Trust/reporting flows rely on artifact path conventions in CI; keep workflow and docs synchronized.

## Minimal validation before tag

- Smoke no-build commands:
  - `scan --format sarif`
  - `ci --format sarif`
  - `trust --format sarif`
  - `review --format sarif` (or `diff --format sarif` fallback)
- Targeted tests:
  - `tests/cli-sarif.test.ts`
  - `tests/format.test.ts`
  - `tests/sarif.test.ts`
