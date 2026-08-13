# Tasks: Guardian Core Domain and Git Change Collector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520–700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: public domain API; PR 2: collector and integration tests |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Domain/public API exports | PR 1 | `npx vitest run tests/guardian-domain.test.ts` | N/A: pure helpers and exports | Revert `src/guardian/index.ts`, `src/types.ts`, `src/index.ts`, package glob, domain test |
| 2 | Diff collector and Git sources | PR 2 | `npx vitest run tests/guardian-change-collector.test.ts` | Temp real Git repositories | Revert collector and collector test only |

## Phase 1: Domain API and Public Wiring

- [x] 1.1 RED — Create `tests/guardian-domain.test.ts` covering `defaultGuardianConfig`, `GUARDIAN_SEVERITY_ORDER`, all-severity `countFindings`, fail/warn/pass `deriveVerdict`, and deterministic/changed-input `findingId` IDs; assert required package exports.
- [x] 1.2 GREEN — Create `src/guardian/index.ts` exporting all Guardian types, domain helpers, severity order, and collector API names; update `src/types.ts` type re-exports and `src/index.ts` value/type exports without changing existing exports.
- [x] 1.3 GREEN — Update `package.json` `files` with `dist/guardian/*`; verify the domain test passes and no runtime dependency is added.

## Phase 2: Change Collection and Git Integration

- [x] 2.1 RED — Create `tests/guardian-change-collector.test.ts` with literal fixtures for added/modified/deleted/rename/binary statuses, exact hunk stats, `includeHunks`, empty/whitespace, malformed, traversal, and sorted unique `affectedFiles` semantics.
- [x] 2.2 RED — Extend the same test with stdin, staged, base, safe relative file, and working-tree sources; cover staged+unstaged tracked changes, untracked exclusion, no-HEAD `[]`, non-repo error, invalid ref, binary input, and shell-metacharacter safety using `tests/git.test.ts` temp-repo helpers/pattern.
- [x] 2.3 GREEN — Create `src/guardian/change-collector.ts`: reuse `parseUnifiedDiff`, `readDiffFile`, `readStagedDiff`, and `readDiffFromBase`; implement `changesFromDiff`, private `toChange` stats/hunk mapping, `collectChanges`, argv-only `readWorkingTreeDiff`, `collectWorkingTreeChanges`, and `affectedFiles` contracts.
- [x] 2.4 GREEN — Confirm all collector RED tests pass, including zero statistics for binary entries, slash-normalized paths, delete old-path selection, rename new-path selection, and propagated parser/path/repository/ref errors.

## Phase 3: Verification

- [x] 3.1 Run `npm run build` and `npm test`; confirm emitted `dist/guardian/*` artifacts and package-content regression coverage.
