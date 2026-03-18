# drift rules catalog (current)

Source of truth: `RULE_WEIGHTS` in `src/analyzer.ts`.

This catalog reflects the current repository state and includes all rule IDs currently weighted/scored by drift.

| id | severity | weight | phase/origin | note |
|---|---|---:|---|---|
| `large-file` | error | 20 | phase0-basic | file exceeds size threshold |
| `large-function` | error | 15 | phase0-basic | function exceeds line threshold |
| `debug-leftover` | warning | 10 | phase0-basic | debug console calls / TODO-like leftovers |
| `dead-code` | warning | 8 | phase0-basic | unused named imports in file |
| `duplicate-function-name` | error | 18 | phase0-basic | repeated function names in same file |
| `comment-contradiction` | warning | 12 | comments rule | comment restates obvious code intent |
| `no-return-type` | info | 5 | phase0-basic | missing explicit return type |
| `catch-swallow` | warning | 10 | phase0-basic | empty catch blocks |
| `magic-number` | info | 3 | magic rule | numeric literals used directly |
| `any-abuse` | warning | 8 | phase0-basic | explicit `any` usage |
| `high-complexity` | error | 15 | phase1-complexity | high cyclomatic complexity |
| `deep-nesting` | warning | 12 | nesting rule | nested control flow too deep |
| `too-many-params` | warning | 8 | nesting rule | function has too many parameters |
| `high-coupling` | warning | 10 | coupling rule | too many module dependencies |
| `promise-style-mix` | warning | 7 | promise rule | mixed async/await and then/catch styles |
| `unused-export` | warning | 8 | phase2-crossfile | export not imported elsewhere |
| `dead-file` | warning | 10 | phase2-crossfile | file not imported by project |
| `unused-dependency` | warning | 6 | phase2-crossfile | package.json dependency unused in sources |
| `circular-dependency` | error | 14 | phase3-arch | circular import graph edges |
| `layer-violation` | error | 16 | phase3-arch (config-driven) | invalid import direction across configured layers |
| `cross-boundary-import` | warning | 10 | phase3-arch (config-driven) | invalid import across configured modules/boundaries |
| `controller-no-db` | warning | 11 | phase3-configurable | controller imports DB/repository concerns directly |
| `service-no-http` | warning | 11 | phase3-configurable | service imports/uses HTTP transport concerns |
| `max-function-lines` | warning | 9 | phase3-configurable | function/method exceeds configured max lines |
| `over-commented` | info | 4 | phase5-ai | excessive comments heuristic |
| `hardcoded-config` | warning | 10 | phase5-ai | hardcoded URLs/secrets/config literals |
| `inconsistent-error-handling` | warning | 8 | phase5-ai | mixed error-handling styles |
| `unnecessary-abstraction` | warning | 7 | phase5-ai | wrappers/abstractions with little value |
| `naming-inconsistency` | warning | 6 | phase5-ai | mixed naming conventions |
| `ai-code-smell` | warning | 12 | analyzer meta-rule | aggregated AI-smell signal from multiple heuristics |
| `semantic-duplication` | warning | 12 | phase8-semantic | AST fingerprint identifies equivalent functions |
| `plugin-error` | warning | 4 | plugin diagnostics | plugin load/contract/runtime failure surfaced as issue |
| `plugin-warning` | info | 0 | plugin diagnostics | non-fatal plugin validation warning |
| `analysis-skip-max-files` | info | 0 | analysis guardrail diagnostics | file skipped due to `maxFiles` limit |
| `analysis-skip-file-size` | info | 0 | analysis guardrail diagnostics | file skipped due to `maxFileSizeKb` limit |

## Notes

- Config-driven rules require matching config blocks to execute (`layers`, `modules`/legacy aliases, `architectureRules`).
- `plugin-*` and `analysis-skip-*` are diagnostic rules emitted as issues and included in scoring with their configured weights.
- Total rule IDs currently defined: **35**.
