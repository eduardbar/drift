# Drift Guardian — UI/UX Design Brief

**Status:** Draft v1
**Scope:** CLI terminal output + GitHub check/SARIF presentation. The MVP has **no dashboard**.

---

## 1. Design principles

Guardian inherits drift's developer-tooling identity:

1. **Dark developer tooling aesthetic** — designed on dark terminals, readable on light.
2. **High legibility** — dense but scannable; alignment over decoration.
3. **Minimal decoration** — no ASCII art, no spinners, no emoticons; structure comes from
   grouping and alignment.
4. **Information first** — the finding text, the location, the rule; styling never competes.
5. **Terminal-friendly** — respect 80-column width; honor `NO_COLOR`, `CI`, and `TERM=dumb`;
   color is an enhancement, never the carrier of meaning.
6. **Accessibility** — severity is always conveyed by text (`[BLOCKING]`) in addition to color;
   contrast ≥ 4.5:1 on dark backgrounds.

---

## 2. Visual semantics

| Semantic | Meaning | Terminal color (kleur) | GitHub check | SARIF level | Exit |
| --- | --- | --- | --- | --- | --- |
| `PASS` | no findings at gate severity | green (`#3fb950`) | ✓ green | — | 0 |
| `INFO` | advisory/context | cyan (`#39c5cf`) | ✓ green | note | 0 |
| `WARNING` | risk, non-blocking by default | yellow (`#d29922`) | ✓ yellow | warning | 0 (or 1 if `fail_on` includes it) |
| `ERROR` | policy violation | red (`#f85149`) | ✗ red | error | 1 |
| `BLOCKING` | must-fix before merge | bright red + `[BLOCKING]` prefix (`#ff6b6b`) | ✗ red (failing) | error | 1 |

Color palette (GitHub dark theme compatible):

- Background: default terminal; no background painting except optional finding-group tinting.
- Green `#3fb950`, Yellow `#d29922`, Red `#f85149`, Bright red `#ff6b6b`, Cyan `#39c5cf`,
  Gray `#8b949e`, White `#e6edf3`.
- Usage: `kleur` (existing dependency) — never raw ANSI codes outside `src/printer.ts` helpers.

---

## 3. Typography & spacing

- **Font**: monospace; no font control (terminal-owned).
- **Case**: severity labels uppercase; rule ids lowercase; sentences regular case.
- **Spacing**: one blank line between findings; two before verdict; indent continuation 2 spaces;
  label column aligned at 10 chars:

```
[BLOCKING] architecture/presentation-not-infra
           src/api/user.ts:12
```

- **Icons**: none in MVP terminal output (unicode box-drawing reserved for the optional
  playground); severity conveyed by `[TAG]` + color. In GitHub, native status icons are used.

---

## 4. Finding presentation

Canonical block:

```
[BLOCKING] architecture/presentation-not-infra
src/api/user.ts
   ↓ imports
src/infrastructure/database.ts

Rule:        presentation → infrastructure forbidden
Severity:    BLOCKING
Evidence:    import { connect } from '../infrastructure/database'
Fix:         Move the call behind an interface in the domain layer.
```

Rules for the block:

1. First line: `[SEVERITY] category/rule-id` — the scan path.
2. Location: relative repo path; `file:line` when a line exists (repeat per location).
3. Optional `↓ imports` arrow block for architecture findings (from → to).
4. `Rule:` line — human-readable rule statement.
5. `Severity:` line — repeats severity for screen readers / no-color mode.
6. `Evidence:` — one-line excerpt of the offending code/diff hunk.
7. `Fix:` — only when a suggestion is configured.

### 4.1 Grouping

Findings group by severity in the terminal:

```
BLOCKING (1)
───────────
[BLOCKING] ...

ERRORS (2)
──────────
[ERROR] ...

WARNINGS (3)
────────────
[WARNING] ...

INFO (1)
────────
[INFO] ...
```

### 4.2 Verdict footer

```
Guardian: FAIL — 1 blocking, 2 errors, 3 warnings, 1 info
Files: 5 changed, 3 affected   Mode: base (main)   Time: 0.42s
```

- Verdict word colored per §2 (`PASS`/`WARN`/`FAIL`).
- In `--format json`, no terminal styling is applied (plain JSON).

---

## 5. GitHub check representation

The GitHub Action renders:

- **Check name**: `Drift Guardian`
- **Summary**: `Guardian: PASS — 0 blocking, 0 errors, 2 warnings (5 files)`
- **Annotations** (when `format: github` or SARIF upload): one annotation per finding at
  `file:line` with severity → annotation level (`failure`/`warning`/`notice`).
- **Optional AI comment** (ai.enabled): posted once per PR run, prefixed:

```
> **Drift Guardian — AI advisory** (not a merge authority)
> Summary: ...
> Risks: ...
```

SARIF mapping (Phase 6):

| Guardian | SARIF |
| --- | --- |
| finding | `result` |
| severity info/warning/error/blocking | `level` note/warning/error/error |
| category/rule-id | `ruleId` (`guardian/<category>/<rule>`), rules table in `tool.driver.rules` |
| file:line:column | `locations[].physicalLocation` |
| evidence | `message.text` + `codeFlows` (optional) |
| suggestion | `message.text` suffix `Fix: ...` |
| summary | `run.properties` |

---

## 6. Optional web playground components (not MVP)

If built (see APP_FLOW §4):

- `DiffEditor` — readonly textarea with line numbers for pasted diff.
- `FindingList` — severity-tinted cards reusing the canonical block layout.
- `VerdictBadge` — PASS/WARN/FAIL pill.
- `PolicyToggle` — switch between bundled policy packs.
- **No** dashboard, charts, auth, or persistence.

---

## 7. Accessibility checklist

- [ ] Severity always text-tagged, never color-only.
- [ ] `NO_COLOR=1` / `CI` / `TERM=dumb` → no ANSI codes, same layout.
- [ ] Findings sorted deterministically (severity, then file, then line).
- [ ] `--format github` uses native annotation levels.
- [ ] SARIF `level` never relies on color.
