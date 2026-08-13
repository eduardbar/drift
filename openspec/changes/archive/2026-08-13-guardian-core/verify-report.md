```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9e7c7cf26af39074e45fc305f9544676520389643ce5fc6350754d476caeb2
verdict: pass
blockers: 0
critical_findings: 0
requirements: 4/4
scenarios: 6/6
test_command: npx vitest run tests/guardian-domain.test.ts tests/guardian-change-collector.test.ts && npm test
test_exit_code: 0
test_output_hash: sha256:f5a5de499f3827a5b2766aa052130095d0e48554f33ef64fb225248cc4dd6b0d
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:9e7c7cf26af39074e45fc305f9544676520389643ce5fc6350754d476caeb2
```

## Verification Report

**Change**: guardian-core  
**Version**: Guardian Core Specification  
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Requirements total | 4 |
| Requirements verified | 4 |
| Scenarios total | 6 |
| Scenarios verified | 6 |
| Tasks total | 11 |
| Tasks complete | 11 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Focused tests**: ✅ 2 files, 9 tests passed.  
Command: `npx vitest run tests/guardian-domain.test.ts tests/guardian-change-collector.test.ts`

**Full tests**: ✅ 37 files, 370 tests passed, 0 failed.  
Command: `npm test`

**Build**: ✅ Passed, exit code 0; Guardian JavaScript, declarations, and source maps emitted under `dist/guardian/`.  
Command: `npm run build`

**Coverage**: ➖ Not separately executed; coverage tooling exists but was not part of the requested gates.

### Spec Compliance Matrix
| Requirement | Scenario | Test / evidence | Result |
|-------------|----------|-----------------|--------|
| Public Guardian domain API | Defaults and verdicts | `tests/guardian-domain.test.ts` defaults/severity and verdict tests | ✅ COMPLIANT |
| Public Guardian domain API | Stable finding identity | `tests/guardian-domain.test.ts` stable FNV-1a IDs test | ✅ COMPLIANT |
| Diff-source collection | Source and mapping coverage | `tests/guardian-change-collector.test.ts` status/source/statistics tests | ✅ COMPLIANT |
| Diff-source collection | Invalid or empty input | `tests/guardian-change-collector.test.ts` empty/malformed/unsafe test | ✅ COMPLIANT |
| Working-tree and affected-file semantics | Working-tree boundaries | `tests/guardian-change-collector.test.ts` staged/base/worktree safety test | ✅ COMPLIANT |
| Working-tree and affected-file semantics | Empty repository and path selection | `tests/guardian-change-collector.test.ts` affected paths/no-HEAD/non-repo tests | ✅ COMPLIANT |
| Packaging and verification | Package and safety regression | Build/package inspection and real-Git safety test | ✅ COMPLIANT |

**Compliance summary**: 6/6 scenarios compliant.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Public API and deterministic domain helpers | ✅ Implemented | Guardian barrel, root exports, defaults, verdicts, counts, and FNV-1a IDs match the contract. |
| Diff collection and normalization | ✅ Implemented | Existing parser/readers are reused; statuses, paths, hunk retention, content-only statistics, binary zero statistics, empty input, and errors are preserved. |
| Working-tree and affected-file behavior | ✅ Implemented | Uses argv-only `git diff HEAD --no-color`; verifies repository/HEAD, excludes untracked files, and selects sorted unique paths. |
| Packaging and dependency constraints | ✅ Implemented | `dist/guardian/*` is published; no runtime dependency was added; reused modules have no diff. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Thin adapter over existing parser/readers | ✅ Yes | Collector delegates to `ai-guard-diff.ts` and `git.ts`. |
| Hunk retention defaults true | ✅ Yes | `includeHunks ?? true`; false returns empty hunks after statistics. |
| HEAD baseline and argv-only execution | ✅ Yes | Runs `git diff HEAD --no-color` with argument arrays and no shell. |
| Empty diff is a no-op | ✅ Yes | Shared parser path returns `[]` for empty/whitespace input. |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD evidence reported | ✅ | `apply-progress.md` contains evidence for all tasks. |
| All tasks have tests | ✅ | 11/11 task checkboxes complete. |
| RED confirmed | ✅ | Both Guardian test files exist and were reported written before implementation. |
| GREEN confirmed | ✅ | Focused runtime execution passed 9/9 tests. |
| Triangulation adequate | ✅ | Tests cover varied statuses, values, errors, paths, and source modes. |
| Safety net | ✅ | Existing suite passed 370 tests; characterization coverage is noted. |

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 5 | 2 | Vitest |
| Integration | 4 | 1 | Vitest + temporary Git repositories |
| E2E | 0 | 0 | N/A |
| **Total** | **9** | **2** | |

### Changed File Coverage
Coverage analysis skipped; no coverage run was requested for this verification.

### Assertion Quality
**Assertion quality**: ✅ All assertions verify real behavior. No tautologies, ghost loops, or mock-heavy tests found.

### Quality Metrics
**Linter**: ➖ Not configured as a project verification command.  
**Type checker**: ✅ Passed through `npm run build`.

### Issues Found
**CRITICAL**: None.  
**WARNING**: None.  
**SUGGESTION**: None.

### Verdict
PASS

All four requirements, six scenarios, and eleven tasks are complete, with focused tests, the full suite, build, packaging, and safety checks passing.
