# Changelog

All notable changes to drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0]

### Added
- `--ai` flag: outputs LLM-optimized JSON (`AIOutput`) designed to be pasted directly into Claude, GPT, or any other model as context. Issues are ranked by severity and effort — quick wins first. Each issue includes `fix_suggestion` and `effort` level. The output includes `recommended_action` generated from the scan.
- `--fix` flag: shows inline fix suggestions in the console for each detected issue, rendered as a visual diff block.

### Changed
- `formatAIOutput()` added to `reporter.ts` — produces the `AIOutput` structure with `summary`, `priority_order`, and `context_for_ai`.

---

## [0.2.3]

### Fixed
- `npx @eduardbar/drift` now works correctly on Windows. The issue was that Node.js on Windows does not execute the shebang (`#!/usr/bin/env node`) in ES module `.js` files reliably. Added `bin/drift.js` as a thin wrapper with a dynamic `import()` that works cross-platform.

---

## [0.2.2]

### Fixed
- CI workflow was triggering a double publish on the same release. Removed the duplicate `push: tags` trigger — now uses only `release: published`. Added a guard step that checks `npm view @eduardbar/drift@$VERSION` before publishing to skip if already published.

### Refactored
- `formatMarkdown()` in `reporter.ts` split into smaller helper functions for readability.

---

## [0.2.1]

### Added
- `drift-ignore` comment support: add `// drift-ignore` on a line (or the line above it) to suppress that specific issue.
- `drift-ignore-file` comment support: add `// drift-ignore-file` in the first 10 lines of a file to exclude the entire file from analysis. Used in `printer.ts` itself — its `console.log` calls are intentional CLI output, not debug leftovers.

### Fixed
- drift was reporting issues in its own `printer.ts` when run on itself. Fixed by adding `// drift-ignore-file` to that file.

---

## [0.2.0]

### Added
- ASCII score bar in console output (`█████████████░░░░░░░ 67/100`).
- Executive summary header with total file count, error/warning/info counts, and top issues.
- File count shown after scan completes.
- `scoreToGrade`, `severityIcon`, and `scoreBar` extracted to `src/utils.ts` — shared between printer and reporter.

### Changed
- Console output restructured with cleaner visual hierarchy.

---

## [0.1.0]

### Added
- Initial release.
- AST analysis engine using ts-morph.
- 8 detection rules: `large-file`, `large-function`, `debug-leftover`, `dead-code`, `duplicate-function-name`, `any-abuse`, `catch-swallow`, `no-return-type`.
- Score 0–100 per file and per project (average).
- Console printer with color output using kleur.
- Markdown reporter (`--output`).
- Raw JSON output (`--json`).
- CI integration via `--min-score` (exit code 1 if score exceeds threshold).
- CLI entry point with Commander.js.
- GitHub Actions workflow for automated npm publish on release.
