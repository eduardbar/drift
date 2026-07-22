# drift-scan Action (v2 contract)

Composite action to run `drift scan` in CI without global installs.

## Contract highlights

- Runtime strategy: `npm exec --yes --prefix "$RUNNER_TEMP/drift-cli" --package=@eduardbar/drift@<version> -- drift ...` (no `npm install -g`)
- Uses isolated `--prefix` under `$RUNNER_TEMP` to avoid bin resolution conflicts in self-hosting repository workflows
- Default drift version is pinned (`1.6.0`) for deterministic runs
- Uses `drift scan --json` and extracts typed outputs
- Critical command/parse failures are not silenced (step fails immediately)

## Usage

```yaml
- name: Check drift score
  id: drift_scan
  uses: ./.github/actions/drift-scan
  with:
    path: ./src
    min-score: 60
    fail-on-threshold: true
    version: 1.6.0
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Path to scan | `.` |
| `min-score` | Fail if score exceeds this | `80` |
| `fail-on-threshold` | Whether to fail on threshold | `true` |
| `version` | drift version for `npm exec` execution | `1.6.0` |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | Project drift score (0-100) |
| `grade` | Grade: CLEAN / LOW / MODERATE / HIGH / CRITICAL |
| `errors` | Error-level issue count |
| `warnings` | Warning-level issue count |
| `infos` | Info-level issue count |
| `total-issues` | Total issue count |
| `files-affected` | Files with at least one issue |
| `top-rules` | Top 3 rules as `rule:count` CSV |

## Example: consume outputs

```yaml
- name: Print drift outputs
  run: |
    echo "Score: ${{ steps.drift_scan.outputs.score }}"
    echo "Grade: ${{ steps.drift_scan.outputs.grade }}"
    echo "Errors/Warnings/Infos: ${{ steps.drift_scan.outputs.errors }}/${{ steps.drift_scan.outputs.warnings }}/${{ steps.drift_scan.outputs.infos }}"
    echo "Top rules: ${{ steps.drift_scan.outputs.top-rules }}"
```
