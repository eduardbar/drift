# Guardian Core Specification

## Purpose

Provide a public, deterministic Guardian domain model and read-only normalized Git change collection.

## Requirements

### Requirement: Public Guardian domain API

The package MUST export from `src/guardian/index.ts` all Guardian model/config types in `types.ts`, `defaultGuardianConfig`, `deriveVerdict`, `countFindings`, `findingId`, `GUARDIAN_SEVERITY_ORDER`, and collector APIs. `src/types.ts` and `src/index.ts` MUST add these exports without changing existing APIs.

`GUARDIAN_SEVERITY_ORDER` MUST be `blocking`, `error`, `warning`, `info`. `defaultGuardianConfig` MUST return version 1 defaults defined by TRD §4: empty rule/path lists; API detection and breaking-only enabled; AI disabled with its documented review/budget/timeout defaults; and exit `failOn` blocking/error with warning enabled. `countFindings` MUST return counts for all four severities. `deriveVerdict` MUST fail when any finding matches configured `failOn` (default blocking/error), otherwise warn only when a warning exists and `warnOnViolation` is true, otherwise pass. `findingId` MUST deterministically return `<ruleId>-<8-hex FNV-1a hash(ruleId|file-or-empty|line-or-0)>`.

#### Scenario: Defaults and verdicts
- GIVEN findings at every severity and omitted exit config
- WHEN helpers are invoked
- THEN counts, default config, severity order, and fail/warn/pass verdicts match this requirement

#### Scenario: Stable finding identity
- GIVEN identical rule, file, and line inputs
- WHEN `findingId` is called repeatedly
- THEN it returns the identical ID and changed inputs produce their corresponding deterministic ID

### Requirement: Diff-source collection

`collectChanges(projectPath, source, options?)` MUST dispatch stdin content, staged diff via `readStagedDiff`, base diff via `readDiffFromBase`, and relative diff file via `readDiffFile`, then parse through `parseUnifiedDiff`. It MUST propagate parser, path-safety, repository, and ref errors. `changesFromDiff` MUST return `[]` for empty/whitespace input and throw malformed-diff errors otherwise.

Each `GuardianChange` MUST preserve parser status (`added`, `modified`, `deleted`, `rename`, `binary`), normalized slash-separated optional old/new paths, and parser hunks unless `includeHunks` is false; that option MUST default to true and then return `hunks: []`. Additions/deletions MUST count only `+`/`-` hunk content lines, never `+++`/`---` headers; changedLines MUST equal their sum. Binary changes MUST remain present with zero statistics.

#### Scenario: Source and mapping coverage
- GIVEN valid stdin, staged, base-ref, and safe diff-file sources covering every status
- WHEN changes are collected
- THEN each source uses its reader and returns normalized paths, exact statistics, and default hunks

#### Scenario: Invalid or empty input
- GIVEN whitespace, malformed, or traversal-path diff input
- WHEN `changesFromDiff` is called
- THEN whitespace returns `[]` and malformed or unsafe input throws

### Requirement: Working-tree and affected-file semantics

`collectWorkingTreeChanges` MUST acquire `git diff HEAD --no-color` using argv-only execution and return staged plus unstaged changes relative to HEAD. It MUST exclude untracked files, return `[]` when the repository has no HEAD, and throw an error containing `Not a git repository` outside Git. `affectedFiles(changes)` MUST return sorted unique `newPath ?? oldPath` values: a delete contributes its old path; a rename contributes its new post-change path while retaining both paths in its change record.

#### Scenario: Working tree boundaries
- GIVEN a committed repository with staged, unstaged, and untracked files
- WHEN working-tree changes are collected
- THEN staged and unstaged changes appear and untracked files do not

#### Scenario: Empty repository and path selection
- GIVEN an initialized repository without HEAD and changes including delete and rename records
- WHEN collection and affected-file calculation run
- THEN collection is empty; delete selects oldPath and rename selects newPath in sorted unique output

### Requirement: Packaging and verification

`package.json` MUST include `dist/guardian/*` in published files and this slice MUST add no runtime dependency. Tests MUST use temporary real Git repositories following `tests/git.test.ts`, cover all preceding scenarios, and prove shell metacharacters are not executed through existing Git reader guards.

#### Scenario: Package and safety regression
- GIVEN a clean build and malicious base-ref text
- WHEN package-content and collector/Git tests run
- THEN Guardian artifacts are packaged, no marker command executes, and tests pass
