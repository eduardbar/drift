# Archive Report: guardian-core

## Final State

- **Status:** Archived successfully.
- **Review gate:** Allow. Native post-apply validation for lineage `review-b48573cc422461e8` returned `result=allow`, with an approved terminal receipt (`sha256:f69eb78669b2911d5f0c291fc7a43a4e50bb94fc6a7ce17c28d12d9a1af60a4b`). No findings required resolution.
- **Verification:** PASS. Four requirements and six scenarios were verified.
- **Tasks:** 11/11 implementation tasks complete; no unchecked implementation tasks remained in `tasks.md`.
- **Tests:** Focused Guardian tests passed: 2 files, 9 tests. Full suite passed: 37 files, 370 tests.
- **Build:** `npm run build` passed with exit code 0; Guardian artifacts were emitted under `dist/guardian/`.
- **Warnings and blockers:** None. No intentional partial archive or checkbox reconciliation was required.

## Spec Synchronization

The root delta spec was normalized to the canonical OpenSpec location before archival:

- `openspec/changes/guardian-core/spec.md` → `openspec/changes/guardian-core/specs/guardian/spec.md`
- New domain source of truth created at `openspec/specs/guardian/spec.md` because no main Guardian spec existed.

The delta was a full specification for the new `guardian` domain, so it was copied without requirement merge conflicts. The archived change retains the canonical `specs/guardian/spec.md` artifact.

## Archive Contents

- `exploration.md`
- `proposal.md`
- `specs/guardian/spec.md`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `archive-report.md`

The active `openspec/changes/guardian-core/` directory no longer exists. The completed change is archived at `openspec/changes/archive/2026-08-13-guardian-core/`.

## Engram Traceability

Source artifacts and review authority read for this archive:

- `sdd/guardian-core/proposal` — observation `#1497`
- `sdd/guardian-core/spec` — observation `#1508`
- `sdd/guardian-core/design` — observation `#1513`
- `sdd/guardian-core/tasks` — observation `#1517`
- `sdd/guardian-core/verify-report` — observation `#1528`
- `sdd/guardian-core/review/transaction` — observation `#1530`
- `sdd/guardian-core/review/ledger` — observation `#1531`
- `sdd/guardian-core/review/receipt` — observation `#1532`
- `sdd/guardian-core/review/gate-context` — observation `#1533`

## Conclusion

The `guardian-core` SDD cycle is complete. The Guardian domain model and Git change collector are implemented, verified, review-approved, synchronized into the main OpenSpec catalog, and archived.
