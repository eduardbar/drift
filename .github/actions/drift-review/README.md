# drift-review Action

Composite action for PR workflows that wraps `drift trust`, optional `drift review`, and `drift trust-gate`.

The action runs drift via `npm exec` with an isolated prefix under `$RUNNER_TEMP/drift-cli` to avoid local bin resolution conflicts when workflows execute inside the `@eduardbar/drift` repository.

If the requested `version` is not published on npm yet (for example, release-prep PRs), the action falls back to the local repository CLI (`npx --no-install tsx ./src/cli.ts`) so PR checks can still run.

## Why this action exists

The repository workflow (`.github/workflows/review-pr.yml`) uses trust as the merge gate and review markdown as complementary context. This action packages that flow as a reusable contract:

1. Generate trust markdown + JSON
2. Optionally generate review markdown
3. Extract stable trust outputs for downstream jobs/comments
4. Enforce trust gate when configured

## Usage

```yaml
- name: Drift trust/review
  id: drift_review
  uses: ./.github/actions/drift-review
  with:
    path: .
    base-ref: origin/${{ github.base_ref }}
    version: 1.7.0
    min-trust: 40
    max-risk: HIGH
    fail-on-gate: true
    include-review: true
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Path to analyze | `.` |
| `base-ref` | Base git ref for diff-aware trust/review | `origin/main` |
| `version` | drift version for `npm exec` execution | `1.7.0` |
| `min-trust` | Failing threshold for trust score | `45` |
| `max-risk` | Failing threshold for merge risk | `HIGH` |
| `fail-on-gate` | Enforce trust gate failure | `true` |
| `include-review` | Generate review markdown file | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | `trust_score` from trust JSON |
| `merge-risk` | `merge_risk` from trust JSON |
| `new-issues` | New issue count from `diff_context` or `n/a` |
| `resolved-issues` | Resolved issue count from `diff_context` or `n/a` |
| `trust-json` | Trust JSON file path |
| `trust-markdown` | Trust markdown file path |
| `review-markdown` | Review markdown file path |

## Failure behavior

- Parsing failures on trust JSON fail the step.
- Gate violations fail when `fail-on-gate=true`.
- No `|| true` paths are used for critical scan/trust/gate commands.
