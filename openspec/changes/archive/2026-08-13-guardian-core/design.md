# Design: Guardian Core Domain and Git Change Collector

## Technical Approach

Complete the existing Phase 1 model's additive public surface, then add a thin, read-only Phase 2 collector. It reuses `parseUnifiedDiff`/`readDiffFile` from `src/ai-guard-diff.ts` and `readStagedDiff`/`readDiffFromBase` from `src/git.ts`; it does not duplicate parsing, path validation, or shared readers.

## Architecture Decisions

| Decision | Options / trade-off | Decision and rationale |
|---|---|---|
| Collector boundary | Refactor shared git/diff vs. thin adapter | Thin `src/guardian/change-collector.ts`; minimizes AI Guard regression risk while inheriting hardened parsing. |
| Hunk retention | Default false saves output vs. default true preserves evidence | `includeHunks` defaults to `true`; Guardian consumers need rule evidence. `false` maps to `hunks: []` after statistics are calculated. |
| Worktree baseline | Index-only vs. `HEAD` | `git diff HEAD --no-color`; includes staged and unstaged tracked changes, deliberately excluding untracked files. |
| Empty input | Throw vs. no-op | Return `[]`; empty diffs are normal repository state, while malformed/unsafe diffs propagate parser errors. |

## Data Flow

```
DiffSource / working tree
  -> existing reader or argv-only git
  -> parseUnifiedDiff (path validation + slash normalization)
  -> private toChange (statistics + optional hunks)
  -> GuardianChange[] -> affectedFiles (sorted unique paths)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/guardian/change-collector.ts` | Create | Source dispatch, HEAD worktree read, mapping, statistics, affected files. |
| `src/guardian/index.ts` | Create | Guardian public barrel. |
| `src/types.ts` | Modify | Re-export Guardian types. |
| `src/index.ts` | Modify | Re-export Guardian values, collectors, and types. |
| `package.json` | Modify | Add `dist/guardian/*` to published files. |
| `tests/guardian-domain.test.ts` | Create | Pure model/helper contracts. |
| `tests/guardian-change-collector.test.ts` | Create | Real-Git collector and safety contracts. |

## Interfaces / Contracts

```ts
export interface ChangeCollectionOptions { includeHunks?: boolean }
export function changesFromDiff(diff: string, options?: ChangeCollectionOptions): GuardianChange[]
export function collectChanges(projectPath: string, source: DiffSource, options?: ChangeCollectionOptions): GuardianChange[]
export function collectWorkingTreeChanges(projectPath: string, options?: ChangeCollectionOptions): GuardianChange[]
export function affectedFiles(changes: GuardianChange[]): string[]
```

`collectChanges` dispatches `stdin`, `staged`, `base`, and `file` to their specified existing readers, then calls `changesFromDiff`. A private `readWorkingTreeDiff(projectPath): string` first verifies the repository with `git rev-parse --git-dir`, verifies `HEAD` with `git rev-parse --verify HEAD`, returning `''` only when HEAD is absent, then runs `execFileSync('git', ['diff', 'HEAD', '--no-color'], { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' })`. Non-repositories throw `Not a git repository`; refs remain argv-only; no command writes.

Private `toChange(entry, includeHunks)` preserves `status`, `oldPath`, and `newPath`. For every hunk line, count additions only when it begins `+` but not `+++`; count deletions only when it begins `-` but not `---`; skip context (` `) and `\\` no-newline markers. `changedLines = additions + deletions`; binary entries therefore have zero counts. Parser-normalized `/` paths are passed through unchanged. `affectedFiles` returns sorted unique `newPath ?? oldPath`; deletes select old path and renames select new path while records retain both.

`src/guardian/index.ts` exports all types (`GuardianSeverity`, `GuardianFindingCategory`, `GuardianLocation`, `GuardianFinding`, `GuardianRule`, `GuardianPolicy`, `GuardianChange`, `GuardianContext`, `GuardianVerdict`, `GuardianResult`, `AIReview`, `AIReviewProvider`, `GuardianArchitectureRule`, `GuardianForbiddenDependency`, `GuardianProtectedPath`, `GuardianAiConfig`, `GuardianExitConfig`, `GuardianConfig`), values (`defaultGuardianConfig`, `deriveVerdict`, `countFindings`, `findingId`, `GUARDIAN_SEVERITY_ORDER`), and the four collector API names above. `src/types.ts` re-exports exactly the Guardian types; `src/index.ts` re-exports the five values/four collector functions plus those types.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | defaults, counts, verdicts, FNV ID; whitespace, every status, hunk counts, `includeHunks`, affected paths | `guardian-domain` and literal unified-diff fixtures. |
| Integration | stdin/staged/base/file/worktree; empty, binary, rename, no HEAD, non-repo, malformed and traversal diffs | Temp repos using `createTempDir`/`initGitRepo`/`commitAll` pattern from `tests/git.test.ts`, cleanup in `afterEach`. |
| Package | emitted Guardian files | Existing clean-build/package-content regression test. |

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and planned RED test |
|---|---|---|
| Documentation-like paths | N/A | Collector neither classifies nor executes files. |
| Git repository selection | Applicable | `cwd` is the supplied root; non-repo throws `Not a git repository`; RED tests use temp non-repo and real repo. |
| Commit state | Applicable | `HEAD` diff includes staged and unstaged tracked changes; no HEAD returns `[]`; untracked excluded; RED tests cover all. |
| Push state | N/A | No push/destination operation. |
| PR commands | N/A | No PR command composition. |

## Migration / Rollout

No migration required. Additive exports only; no runtime dependencies or repository writes.

## Open Questions

None.
