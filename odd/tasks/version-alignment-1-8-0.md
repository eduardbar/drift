# Task: Align the local repository to v1.8.0

## Objective

Align the explicitly authorized local version metadata and documentation to
`1.8.0` without performing release, publishing, remote, or unrelated source
changes.

## Authorized scope

- Update the root package and lockfile metadata.
- Update ESLint plugin and VS Code package dependency/lock metadata.
- Update OpenSpec, action defaults, action documentation, maintainer metadata,
  Guardian product-version references, and the focused package metadata test.
- Preserve historical version references when they are clearly historical.
- Preserve all unrelated tracked and untracked worktree changes.
- Do not access remote systems, push, open PRs, create tags/releases, publish
  npm, or publish the VS Code Marketplace.
- Do not bulk-rewrite archived OpenSpec artifacts or alter schemas,
  producer/consumer implementation, or unrelated documentation.

## Stable checklist

- [x] Root package and lockfile metadata are `1.8.0`.
- [x] ESLint plugin dependency and lock metadata are `1.8.0`-compatible.
- [x] OpenSpec project version is `1.8.0`.
- [x] Both composite action defaults and README examples/tables are `1.8.0`.
- [x] `AGENTS.md` reports package version `1.8.0`.
- [x] Guardian PRD/TRD current product references are `v1.8.0`.
- [x] Focused package metadata test expects `^1.8.0`.
- [x] VS Code extension metadata and CLI dependency/lock metadata are
      `1.8.0`-compatible.
- [x] No unrelated worktree changes are included in the staged set.

## Acceptance criteria

1. Every expected current version value is verified before editing; any
   discrepancy is reported rather than guessed.
2. The focused version tests, docs drift, build, package metadata/content
   checks, and relevant CI alignment checks pass, or exact failures are
   recorded honestly.
3. The task document and its Engram mirror contain final progress and exact
   verification evidence.
4. One Conventional Commit contains only the alignment files, task document,
   and associated tests/docs.

## Checks

- Focused version tests: PASS — `npm exec vitest run tests/package-metadata.test.ts tests/ci-version-alignment.test.ts tests/runtime-policy-alignment.test.ts` (3 files, 8 tests).
- Docs drift: PASS — `npm run check:docs-drift` (35 rule IDs, package version 1.8.0).
- Build: PASS — `npm run build`.
- Package metadata/content checks: PASS — metadata/lock assertion, alignment text assertion, `npm exec vitest run tests/package-content.test.ts` (1 test), and ESLint plugin build.
- Relevant CI alignment checks: PASS — included in the focused version test command; action defaults, README literals, and CI hardcoded package references are aligned.
- VS Code package build: FAIL — `npm --prefix packages/vscode-drift run build`; existing dependency/type resolution failures (`@eduardbar/drift`, `vscode`, and related implicit-any/property errors) because package dependencies are not installed locally. No remote install was attempted.
- Scope and staged diff review: PASS — staged set contains only the 16 authorized alignment/task files; unrelated changes remain unstaged.
- Commit: BLOCKED — `git commit -m "chore(release): align local metadata to v1.8.0"` failed because Git user identity is not configured (`Author identity unknown`). No Git configuration was changed.

## Route evidence (delegated direct)

- Prior local exploration identified the alignment surface and current
  mismatches; no remote or publishing operation is authorized.
- Implementation route: verify values -> update task evidence -> edit only
  listed alignment files -> run focused checks -> inspect scope -> commit one
  work unit.

## Progress

- [x] Prior exploration findings read and current worktree inspected.
- [x] This ODD task document created before source/config writes.
- [x] Version-alignment edits complete.
- [x] Verification complete with exact results recorded; VS Code package build blocker is explicit.
- [x] Task document and Engram mirror updated with final evidence.
- [ ] Scoped Conventional Commit created — blocked by missing local Git author identity.
