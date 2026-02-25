# drift-scan Action

Scan your TypeScript project for AI-generated technical debt in CI.

## Usage

```yaml
- name: Check drift score
  uses: eduardbar/drift@v1
  with:
    path: ./src
    min-score: 60
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Path to scan | `.` |
| `min-score` | Fail if score exceeds this | `80` |
| `fail-on-threshold` | Whether to fail on threshold | `true` |
| `version` | drift version to use | `latest` |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | Project drift score (0-100) |
| `grade` | Grade: CLEAN / LOW / MODERATE / HIGH / CRITICAL |

## Example: PR gate

```yaml
name: Drift Check
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: eduardbar/drift@v1
        with:
          path: ./src
          min-score: 60
          fail-on-threshold: true
```

## Example: capture outputs

```yaml
- name: Scan drift
  id: drift
  uses: eduardbar/drift@v1
  with:
    path: ./src
    fail-on-threshold: false

- name: Print results
  run: echo "Score ${{ steps.drift.outputs.score }}/100 — ${{ steps.drift.outputs.grade }}"
```
