# Task: Improve npm and GitHub discoverability

## Objective

Improve Drift's legitimate discovery and conversion surfaces across npm,
GitHub, VS Code Marketplace, the README, and the landing page without making
unverified claims or publishing from a dirty worktree.

## Authorized scope

- Optimize package and Marketplace descriptions and high-intent keywords.
- Improve README entry points for npm, GitHub Actions, VS Code, MCP, and docs.
- Correct stale VS Code README examples and link users to canonical docs.
- Add actionable discovery links to the landing page while preserving its
  existing visual and SEO structure.
- Align release workflow triggers/tooling only where needed for reliable
  publication.
- Preserve unrelated dirty worktree changes.
- Do not publish npm, Marketplace, GitHub releases, tags, or merge this PR
  without a separate explicit release decision.

## Work units

- [x] A. Optimize npm and Marketplace metadata.
- [x] B. Optimize README entry points and extension documentation.
- [x] C. Add actionable landing-page discovery links.
- [x] D. Align release automation and release narrative where evidence supports
      a safe change.

## Acceptance criteria

1. Metadata uses specific, truthful search terms without keyword stuffing.
2. README and landing page expose clear paths for CLI, CI, VS Code, MCP, and
   documentation users within the first discovery flow.
3. VS Code documentation matches the current CLI contract.
4. Release automation changes are minimal, explicit, and covered by checks.
5. Unrelated worktree changes remain unstaged and uncommitted.
6. Each work unit has focused verification and a Conventional Commit.
7. A PR is opened only after the branch and issue/PR policy requirements are
   satisfied.

## Checks

- `npm run check:docs-drift`
- Focused metadata/version tests
- Root build
- VS Code extension build
- Landing-page checks/build if available
- Diff and scope review before each commit and before PR creation

## Route evidence

- Implementation route: delegated direct, because the work spans multiple
  non-trivial metadata, documentation, workflow, and landing-page files.
- Exploration evidence: release workflow, package metadata, README, extension
  README, landing-page components, and release constraints were mapped before
  writing.
- Delivery strategy: one PR unless the implementation exceeds repository
  policy or the branch/issue workflow requires a split.

## Progress

- [x] Discovery completed and existing npm/Marketplace automation identified.
- [x] ODD task document created before source/documentation writes.
- [x] Implementation work units complete.
- [x] Focused verification complete.
- [ ] Work-unit commits recorded.
- [ ] PR created with required issue linkage and label.

## Implementation evidence

- **A. Metadata:** Updated root npm description/keywords and VS Code Marketplace description/keywords with specific static-analysis, technical-debt, architecture, CI, TypeScript, JavaScript, AST, complexity, and dead-code terms. Versions remain `1.8.0`; package file boundaries are unchanged. `@vscode/vsce` was not added because the existing Marketplace workflow intentionally invokes it through `npx` and does not require a declared package dependency.
- **B. Entry points/docs:** Added compact npm, GitHub Actions, VS Code, MCP, docs, and landing-page links to the README top. Replaced the stale VS Code `drift report . --html` example with the current `drift report .` contract, documented `drift fix . --write`, and linked the canonical rules catalog and CLI docs.
- **C. Landing page:** Added actionable npm, GitHub, Marketplace, Actions, MCP, and docs links to existing hero navigation and footer components without changing the page structure or existing claims.
- **D. Release automation:** Reviewed `.github/workflows/publish.yml` and `.github/workflows/publish-vscode.yml`. No workflow change was justified: both workflows remain tag/release gated, verify versions, skip already-published versions, and publish only after their existing checks/build steps.

## Verification evidence

- `node --input-type=module -e "...metadata/docs assertions..."` — passed; versions unchanged, keyword lists unique and bounded, stale VS Code command absent.
- `npm run check:docs-drift` — passed; package version `1.8.0`, 35 rule IDs, docs aligned.
- `npm run build` — passed.
- `npm run build` in `packages/vscode-drift` — passed.
- `npm run build` in `site` — passed; Vite transformed 48 modules and emitted the production bundle.
- `git diff --check` — passed; only expected CRLF normalization warnings were reported for existing Windows working-copy files.

## Scope review

- Authored diff: 153 additions and 40 deletions across 7 implementation files plus this task document.
- The unrelated dirty worktree files remain unstaged and are not part of the authored change.
