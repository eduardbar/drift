# SDD Exploration: guardian-core

## Status

- **status:** ready
- **artifact_store:** hybrid (OpenSpec + Engram)
- **scope:** Phase 1 domain verification and Phase 2 git change collector

## Executive Summary

The TRD reuse map is substantially accurate for unified-diff parsing, git ref/staged readers, configuration layer types, CLI conventions, MCP registration, and the composite Action pattern. The important qualification is that SARIF's severity mapper and artifact URI normalizer are currently private, so a Guardian reporter cannot directly reuse them without an additive extraction or a deliberately duplicated adapter. Phase 1's `types.ts` and `domain.ts` are present and compile-shaped consistently with TRD §3, but the TRD/implementation-plan claim that the barrel and public exports are already done is not true on disk. Phase 2 can be implemented without new runtime dependencies or production changes outside the planned additive exports and collector.

## Current State

### Domain model (Phase 1)

`src/guardian/types.ts` contains the TRD §3 model plus the TRD §4 configuration interfaces. `GuardianChange` reuses `DiffHunk`; `GuardianContext` reuses `DiffSource`, `LayerDefinition`, and `ModuleBoundary`. `src/guardian/domain.ts` provides pure helpers for defaults, severity counts, verdict derivation, and deterministic finding IDs.

The model is consistent with the TRD's field names and severity/category unions. The config model intentionally uses TypeScript camelCase (`cannotDependOn`, `protectedPaths`, `allowAi`, `failOn`, `warnOnViolation`) while the canonical YAML examples use snake_case (`cannot_depend_on`, `protected_paths`, `allow_ai`, `fail_on`, `warn_on_violation`). This is acceptable only if the future Phase 3 loader owns the mapping/validation boundary; Phase 2 must not assume YAML keys are already normalized.

`src/guardian/index.ts` does not exist. `src/types.ts` has no Guardian export block, `src/index.ts` has no Guardian public exports, and `package.json` currently has no `dist/guardian/*` entry. Therefore the existing files are the domain inputs, not a completed public Phase 1 slice.

### Diff and git seams

- `src/ai-guard-diff.ts` exports `parseUnifiedDiff` and `readDiffFile`. The parser normalizes CRLF, rejects NUL/absolute/traversal paths, tracks added/deleted/rename/binary metadata, and returns `UnifiedDiffEntry[]` with `DiffHunk[]`.
- `src/types/ai-guard.ts` defines `DiffSource`, `DiffHunk`, and `UnifiedDiffEntry`; imports use `.js` suffixes.
- `src/git.ts` exports `readStagedDiff` (`git diff --cached --no-color`) and `readDiffFromBase` (`git diff --no-color <ref>`), verifies repositories/refs, and passes refs as argv through `execFileSync`. Neither function writes to the repository. There is no existing working-tree reader; `git diff HEAD --no-color` is the likely collector seam for staged plus unstaged changes.
- `src/ai-guard-workspace.ts` already contains source selection logic, including safe relative diff-file handling, but the Guardian collector should remain read-only and should not couple to AI-Guard workspace materialization.

### Existing conventions

- TypeScript strict ESM; relative imports use `.js` suffixes.
- CLI uses Commander, `addResourceOptions`, and AI Guard's exit convention: success `0`, policy violation `1`, input/config error `2` (AI Guard sets `process.exitCode` rather than terminating on normal result).
- `kleur` is the existing terminal-color dependency; no new runtime dependency is needed for Phases 1–2.
- Vitest runs Node tests from `tests/**/*.test.ts`, with globals enabled, `fileParallelism: false`, and 15-second test and hook timeouts. There is no lint script; `npm run build` and `npm test` are the practical gates.
- `tests/git.test.ts` creates real temporary repositories with `mkdtempSync`, initializes/configures git, commits fixtures, and cleans them in `afterEach`. This is the correct integration-test pattern for the collector.
- The repository uses Conventional Commits.

### Other reuse-map targets

- `src/types/config.ts` exposes the exact `LayerDefinition` and `ModuleBoundary` shapes referenced by Guardian context; `src/config.ts` loads only `drift.config.ts`, `.js`, or `.json` and silently returns `undefined` on load failure. Guardian config loading is a later, separate concern.
- `src/sarif.ts` defines SARIF 2.1.0 structures and `SarifLevel`, but `mapSeverityToSarifLevel` and `normalizeArtifactUri` are private. The TRD's “reuse mapping helpers” statement requires additive extraction/public helper design in a later reporter phase.
- `src/mcp-server.ts` has a six-tool definition array and a parallel handler map. Guardian MCP registration is explicitly Phase 10, not a Phase 1–2 dependency.
- `.github/actions/drift-scan/action.yml` is a composite action using `npm exec`, temporary output handling, `$GITHUB_OUTPUT`, and threshold failure. A future Guardian action can mirror the pattern, but it is not affected by the collector slice.
- `tests/package-content.test.ts` runs a clean build and `npm pack --dry-run`, compares every packaged `dist/` file with compiler output, and rejects forbidden roots. Adding `dist/guardian/*` to `package.json` should not break it: `actualDist` is derived from the clean compiler output and the per-file allow check accepts every compiler artifact. The new Guardian files must, however, be emitted by the build and included in `src` compilation; an absent/stale build output would fail the equality assertion.

## Affected Areas

- `src/guardian/types.ts` — existing Phase 1 domain contract; verify only, do not modify during exploration.
- `src/guardian/domain.ts` — existing pure domain helpers; verify severity/default/verdict semantics against TRD.
- `src/guardian/change-collector.ts` — planned Phase 2 collector: source dispatch, diff parsing, hunk statistics, path normalization, and working-tree reading.
- `src/guardian/index.ts` — planned barrel for Guardian types/domain/collector exports.
- `src/ai-guard-diff.ts` — parser and safe diff-file reader reused by import; no parser duplication.
- `src/git.ts` — staged/base readers reused; working-tree reader likely needs a collector-local `execFileSync` seam or an additive git helper, with argv-only invocation.
- `src/types.ts` — planned additive Guardian type exports.
- `src/index.ts` — planned additive Guardian runtime/type exports.
- `package.json` — planned `dist/guardian/*` publish-surface entry.
- `tests/guardian-domain.test.ts` — planned pure helper and shape coverage.
- `tests/guardian-change-collector.test.ts` — planned real temp-git integration coverage.
- `tests/package-content.test.ts` — regression contract for clean-build packaging.
- `vitest.config.ts` — establishes the test execution conventions; no change required.

## Phase 2 Contract and Design Gaps

The collector should dispatch `DiffSource` as follows: stdin content directly; staged through `readStagedDiff`; base through `readDiffFromBase`; file through `readDiffFile` with the same project-relative safety boundary; and working tree through a dedicated `readWorkingTreeDiff`. `collectWorkingTreeChanges` should represent staged plus unstaged changes relative to `HEAD`, not merely unstaged changes.

`changesFromDiff` should call `parseUnifiedDiff`, then map each entry through `toChange`. Counts should be derived only from hunk lines: `+` lines excluding `+++` contribute additions, `-` lines excluding `---` contribute deletions, and `changedLines` should be additions plus deletions. Binary entries remain present with zero line statistics. `affectedFiles` should return deterministic, slash-normalized paths, using the new path for additions/modifications and both old/new paths for deletes/renames only if the intended contract explicitly needs both; this old-path question should be fixed in the proposal/spec before implementation.

The `includeHunks` option has an observable ambiguity: when false, should output hunks be omitted (`[]`) or should only the statistics be omitted? The TRD says `GuardianChange.hunks` is required, so the least surprising contract is to retain parsed hunks and treat the option as an explicit memory/output optimization only if the type semantics are documented. This should be resolved before coding.

The requested function list includes `toChange`, but the public interface list in IMPLEMENTATION_PLAN §2 does not expose it. Keep `toChange` private unless tests or the proposal establish it as public API. Likewise, `readWorkingTreeDiff` may be public for testability, but its error/empty-diff behavior should match the existing git readers.

## Approaches

1. **Thin collector over existing parser/readers (recommended)** — keep parsing and path safety in `parseUnifiedDiff`, dispatch existing staged/base/file readers, and add only working-tree diff acquisition plus pure mapping/statistics.
   - Pros: minimal duplication; inherits hardened traversal/NUL/rename/binary behavior; zero runtime dependencies; easy unit/integration boundaries.
   - Cons: working-tree acquisition is a new git seam; `includeHunks` and affected-path semantics need explicit decisions.
   - Effort: Medium

2. **Refactor shared diff/git abstractions first** — extract generic diff-source and SARIF/git helpers before adding Guardian.
   - Pros: potentially cleaner long-term reuse across AI Guard and Guardian.
   - Cons: expands Phase 2 blast radius; risks changing stable AI Guard behavior; unnecessary before collector behavior is proven.
   - Effort: High

## Recommendation

Proceed to `sdd-propose` with the thin collector approach. Treat Phase 1 as verification plus completion of missing public/package exports in the proposal, not as permission to alter the existing domain files during exploration. Specify working-tree semantics (`HEAD` comparison), line-stat rules, rename affected-file behavior, malformed/path-safe errors, empty and binary diffs, and the `includeHunks` contract before implementation. Keep all new logic additive, use argv-only git calls, and add no runtime dependencies.

## Risks

- **TRD status drift:** IMPLEMENTATION_PLAN labels Phases 1–2 done, but the barrel, exports, package entry, and collector are absent on disk.
- **Working-tree semantics:** `readStagedDiff` is cached-only; accidentally reusing it would miss unstaged changes.
- **Rename/path contract:** old/new path inclusion in `affectedFiles` can affect later rules and reporters.
- **Stats correctness:** parser metadata lines (`+++`, `---`) must not be counted as content changes; binary changes must remain representable without fake counts.
- **Public API expansion:** exporting all Guardian types/helpers from root may create naming/API commitments; keep `toChange` private unless deliberately specified.
- **Config naming mismatch:** future loader must map snake_case canonical config keys to camelCase TypeScript fields.
- **SARIF reuse limitation:** current mapping helpers are private, so later extraction must preserve existing SARIF output.
- **Packaging:** `package-content.test.ts` will catch missing compiler artifacts or an unexpected package manifest, so build output must be verified after adding Guardian files.

## Ready for Proposal

Yes. The proposal should define the missing Phase 1 public-surface work together with Phase 2, lock the collector semantics above, and explicitly defer CLI, MCP, SARIF reporter, Action, and Guardian config-loader integration to their planned phases.

## Artifacts

- OpenSpec: `openspec/changes/guardian-core/exploration.md`
- Engram: `sdd/guardian-core/explore`

## Next Recommended

`sdd-propose`

## Skill Resolution

- Loaded `sdd-explore` as requested.
- Loaded shared SDD references and followed hybrid persistence requirements.
- Used CodeGraph before broad source inspection; initialized the project index because `.codegraph/` was absent.
