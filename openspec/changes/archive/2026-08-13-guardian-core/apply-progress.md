# Guardian Core Apply Progress

**Mode:** Strict TDD
**Artifact store:** hybrid (OpenSpec + Engram)
**Delivery:** auto-chain, stacked-to-main; work units are planned only and were not committed.

## Tasks

- [x] 1.1 Domain characterization tests and public export assertions.
- [x] 1.2 Guardian barrel, root type/value exports.
- [x] 1.3 Published `dist/guardian/*` package glob.
- [x] 2.1 Literal collector status/statistics/path tests.
- [x] 2.2 Source and real-Git integration/safety tests.
- [x] 2.3 Thin collector implementation reusing existing parser/readers.
- [x] 2.4 Collector edge cases and propagated errors verified.
- [x] 3.1 Build and full suite verification.

## TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/guardian-domain.test.ts` | Unit | N/A (new) | Written before barrel; initial run blocked by missing installed Vitest | 3 tests passed | Defaults/verdicts/IDs and changed inputs | Clean |
| 1.2 | `tests/guardian-domain.test.ts` | Unit/structural | Existing suite preserved | Written before implementation | 3 tests passed | Multiple export consumers exercised | Clean |
| 1.3 | `tests/guardian-domain.test.ts` | Unit/package | Existing suite preserved | Written before package change | 3 tests passed | Build emitted Guardian artifacts | Clean |
| 2.1 | `tests/guardian-change-collector.test.ts` | Unit | N/A (new) | Written before collector; initial run blocked by missing installed Vitest | 3 tests passed | All five statuses, stats, hunk option, malformed/traversal/paths | Clean |
| 2.2 | `tests/guardian-change-collector.test.ts` | Integration | N/A (new) | Written before collector | 3 integration tests passed | stdin/file/staged/base/worktree/no-HEAD/non-repo/shell safety | Clean |
| 2.3 | `tests/guardian-change-collector.test.ts` | Unit/integration | N/A (new) | Collector referenced before implementation | 9 focused tests passed | Real temp repositories and all source branches | Clean |
| 2.4 | `tests/guardian-change-collector.test.ts` | Integration | N/A (new) | Edge cases included in RED suite | 9 focused tests passed | Binary, parser, path, ref, and repository errors | Clean |
| 3.1 | Existing suite | Build/integration | N/A | N/A (verification) | Build passed; 37 files/370 tests passed | Full suite | N/A |

## Work Unit Evidence

| Work unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|---|---|---|---|
| 1 — Domain/public API | `npx vitest run tests/guardian-domain.test.ts tests/guardian-change-collector.test.ts` — 2 files, 9 tests passed | N/A: pure helpers and module exports | Revert `src/guardian/index.ts`, `src/types.ts`, `src/index.ts`, package glob, and domain test |
| 2 — Collector/Git sources | Same focused command — 2 files, 9 tests passed | Real temporary Git repositories: staged/base/working-tree/no-HEAD/non-repo; passed | Revert `src/guardian/change-collector.ts` and `tests/guardian-change-collector.test.ts` |

## Final Verification

- `npm run build` — passed; emitted `dist/guardian/index.js`, `dist/guardian/change-collector.js`, declarations and maps.
- `npm test` — passed: **37 test files, 370 tests**.
- No runtime dependency added.
- No commits, staging, push, or PR performed.

## Planned Commit Boundaries (not executed)

1. `feat(guardian): expose domain model and public API` — domain tests plus barrel/root exports/package glob.
2. `feat(guardian): collect normalized git changes` — collector and real-Git integration tests.
