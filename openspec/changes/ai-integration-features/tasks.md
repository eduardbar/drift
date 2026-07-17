# Tasks: AI Integration Features (context-file, mcp-server, ai-guard)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2200–2600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation + context-file) → PR 2 (mcp-server) → PR 3 (ai-guard) → PR 4 (E2E/docs) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No (resolved: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation types/git/helpers + context-file | PR 1 | Base: feature/ai-integration. Includes tests/docs for context. |
| 2 | MCP server + SDK | PR 2 | Base: PR 1 branch. Reuses foundation; no context dependency. |
| 3 | AI guard diff engine | PR 3 | Base: PR 2 branch. Needs git diff readers from PR 1. |
| 4 | E2E smoke + documentation | PR 4 | Base: PR 3 branch. Cross-feature validation. |

## Phase 1: Foundation

- [x] 1.1 Create `src/types/context.ts`, `src/types/mcp.ts`, `src/types/ai-guard.ts` with domain interfaces and the `DiffSource` discriminated union.
- [x] 1.2 Modify `src/types/app.ts` to add optional `aiIntegration` and `aiGuard` config keys.
- [x] 1.3 Modify `src/types.ts` to re-export the new domain types.
- [x] 1.4 Modify `src/git.ts` to add `readStagedDiff(projectPath)` and `readDiffFromBase(projectPath, ref)` returning unified-diff strings.
- [x] 1.5 Create `src/watch-utils.ts` with `createDebouncedWatcher(path, cb, delay)` shared by `context --watch` and MCP cache invalidation.
- [x] 1.6 Modify `package.json` to add pinned `@modelcontextprotocol/sdk` dependency.

## Phase 2: context-file (Feature 1)

- [x] 2.1 RED: Write unit tests for `buildContextDocument`, `formatContextMarkdown`, `writeContextFile`, and `checkContextFreshness` in `tests/context.test.ts`.
- [x] 2.2 GREEN: Create `src/context.ts` implementing the four functions and `runWatch` loop using `watch-utils`.
- [x] 2.3 REFACTOR: Extract Markdown-section helpers and guarantee no partial file writes on analysis/write failure.
- [x] 2.4 Modify `src/init.ts` to add `--context` flag that calls `writeContextFile` and appends `.drift/context.md` to `.gitignore`.
- [x] 2.5 Modify `src/cli.ts` to register `context [path]` with `--output`, `--format`, `--max-issues`, `--ci`, `--watch`, and resource flags.
- [x] 2.6 Integration: Add tmpdir fixture tests for default output, custom output, JSON stdout, `--ci` staleness, `--watch` regeneration, and unwritable output path.

## Phase 3: mcp-server (Feature 2)

- [x] 3.1 RED: Write unit tests for `SessionCache` hit/miss/invalidation/serialization and `inspectMCPTools` in `tests/mcp-server.test.ts`.
- [x] 3.2 GREEN: Create `src/mcp-server.ts` with stdio server, 6 tool handlers, `SessionCache`, and stderr-only logger.
- [x] 3.3 REFACTOR: Verify stdout contains only JSON-RPC; forbid `console.log` in `mcp-server.ts` via project lint or comment guard.
- [x] 3.4 Modify `src/cli.ts` to register `mcp` command with `--inspect`.
- [x] 3.5 Integration: Spawn `drift mcp` child process and verify initialize handshake, `tools/list`, all 6 `tools/call`, malformed request returns `-32600`, unknown tool returns `-32601`, and SIGTERM cleanup.

## Phase 4: ai-guard (Feature 3)

- [ ] 4.1 RED: Write unit tests for `parseUnifiedDiff`, `applyDiffToTempDir`, `computeAIGuardResult`, `enforceBudget`, and `enforceBlockOn` in `tests/ai-guard.test.ts`.
- [ ] 4.2 GREEN: Create `src/ai-guard.ts` with `runAIGuard`, diff application, temp-dir lifecycle, and budget/block-on enforcement.
- [ ] 4.3 REFACTOR: Extract diff parsing edge cases (new/delete/rename/binary/empty) and confirm `try/finally` + SIGINT/SIGTERM cleanup in every exit path.
- [ ] 4.4 Modify `src/cli.ts` to register `ai-guard` with `--stdin`, `--staged`, `--diff-file`, `--base`, `--budget`, `--block-on`, `--format`, `--suggestions`, and resource flags.
- [ ] 4.5 Integration: Add tmpdir fixture tests for stdin diff, staged diff in a git repo, file diff, conflicting sources, no source, budget/block-on behavior, and temp-dir cleanup.

## Phase 5: E2E & Verification

- [ ] 5.1 E2E: Run built CLI against drift repo for `drift context`, `drift mcp --inspect`, and `drift ai-guard --staged`; assert exit codes and output schemas.
- [ ] 5.2 Update `README.md` with `context`, `mcp`, and `ai-guard` usage examples.
- [ ] 5.3 Run full vitest suite and drift self-scan; fix regressions.

## Implementation Order

Foundation first (types, git readers, watch util, SDK dependency). Then context-file, then mcp-server, then ai-guard. Each feature is implemented test-first (RED → GREEN → REFACTOR). E2E and docs run last after all three commands exist.

## Dependencies Between Tasks

- 2.x depends on 1.1, 1.2, 1.3, 1.5.
- 3.x depends on 1.1, 1.3, 1.5, 1.6.
- 4.x depends on 1.1, 1.3, 1.4.
- 5.1 depends on 2.6, 3.5, 4.5.

## Risk Assessment

- **Scope risk: High** — three new commands plus a new SDK dependency cross CLI, server, and diff-engine concerns.
- **Review risk: High** — estimated 2200–2600 changed lines exceeds the 400-line budget; chained PRs are required.
- **Concurrency risk (MCP)** — ts-morph `Project` is not thread-safe; `SessionCache` must serialize concurrent analysis calls or risk state corruption.
- **Temp-dir leak risk (ai-guard)** — every exit path (success, error, SIGINT, SIGTERM) must clean up the temp dir; missing handler will leave directories behind.
- **Stdout purity risk (MCP)** — any stray `console.log` or thrown error will break JSON-RPC clients; tests must assert stdout is valid JSON-RPC only.
- **TDD discipline risk** — strict TDD requires writing failing tests before implementation; skipping RED tasks will invalidate the mode.
