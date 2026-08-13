# Proposal: Guardian Core Domain and Git Change Collector

## Intent / Why

Guardian needs a stable representation of repository changes before policy rules can evaluate them.
This slice completes the existing domain baseline's public surface and adds a read-only collector
for normalized per-file changes, without duplicate parsing or runtime dependencies.

## Scenarios

- Maintainers can consume Guardian types and collector helpers from the package API.
- Developers can collect stdin, staged, base-ref, diff-file, and `HEAD` working-tree changes.
- Policy engines receive deterministic statuses, safe paths, hunks, statistics, and binary changes.

## Scope

### In Scope

- Treat existing domain files as baseline; complete the barrel, root exports, and package glob.
- Add the five-source collector, working-tree acquisition, parser reuse, mapping, statistics, and affected-file calculation.
- Add domain and collector tests with pure fixtures and temporary git repositories.

### Out of Scope / Non-goals

- Policy engine, rules, CLI, reporters, Action, AI providers, MCP, config loading, or Guardian-doc edits.
- Shared diff/git refactors or runtime dependencies.

## Capabilities

### New Capabilities

- `guardian-core`: Public Guardian domain model and deterministic git change collection.

### Modified Capabilities

- None.

## Approach and Contract Decisions

- Adapt existing parser/readers; add argv-only `git diff HEAD --no-color` for working-tree changes.
- Count hunk content lines; preserve binary entries with zero counts.
- Normalize paths to `/`; use new paths for additions/modifications, old paths for deletes, and
  both for renames. Propagate malformed/path-safety errors.
- `includeHunks: false` returns `hunks: []`; `toChange` stays private.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/guardian/*`, `src/types.ts`, `src/index.ts` | New/Modified | Model, collector, exports |
| `package.json` | Modified | Publish `dist/guardian/*` |
| `tests/guardian-*.test.ts` | New | Domain and git integration contracts |

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Working-tree misses staged changes | Med | Test staged + unstaged against `HEAD` |
| Rename/stat/path edge cases | Med | Reuse hardened parser and assert all statuses |
| Public API drift | Low | Additive exports only; package-content regression test |

## Rollback Plan

Revert the barrel/exports, package glob, collector, and tests; the existing domain baseline is not rewritten.

## Success Criteria

- [ ] Strict build and `npm test` pass, including package-content checks.
- [ ] Collector covers every source, empty/binary/malformed/path-safe input, statuses, and counts.
- [ ] No repository writes, new runtime dependencies, or changes to existing public behavior.
- [ ] Reviewable authored diff remains within the 400-line budget or is split during task planning.

## Open Questions

- Confirm during specs whether consumers need both paths for deletes as well as renames; this
  proposal currently selects the single old path for deletes.
