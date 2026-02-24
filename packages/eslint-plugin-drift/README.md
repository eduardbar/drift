# eslint-plugin-drift

ESLint plugin that exposes [drift](https://github.com/eduardbar/drift)'s 26 technical debt rules as standard ESLint rules, compatible with ESLint 9 flat config.

## Installation

```bash
npm install --save-dev eslint-plugin-drift eslint
```

## Usage

### Recommended config (all 26 rules)

In your `eslint.config.js` (or `eslint.config.mjs`):

```js
import drift from 'eslint-plugin-drift'

export default [
  ...drift.configs.recommended,
]
```

### Manual config (pick individual rules)

```js
import drift from 'eslint-plugin-drift'

export default [
  {
    plugins: { drift },
    rules: {
      'drift/large-file':       'error',
      'drift/large-function':   'error',
      'drift/any-abuse':        'warn',
      'drift/magic-number':     'warn',
    },
  },
]
```

## Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `drift/large-file` | error | Files over 300 lines |
| `drift/large-function` | error | Functions over 50 lines |
| `drift/duplicate-function-name` | error | Near-identical function names |
| `drift/high-complexity` | error | Cyclomatic complexity > 10 |
| `drift/circular-dependency` | error | Circular import chains |
| `drift/layer-violation` | error | Prohibited architectural layer imports |
| `drift/debug-leftover` | warn | console.log, TODO, FIXME in production |
| `drift/dead-code` | warn | Unused imports |
| `drift/any-abuse` | warn | Explicit `any` type |
| `drift/catch-swallow` | warn | Empty catch blocks |
| `drift/comment-contradiction` | warn | Comments that restate the code |
| `drift/deep-nesting` | warn | Nesting depth > 3 |
| `drift/too-many-params` | warn | Functions with more than 4 parameters |
| `drift/high-coupling` | warn | Files importing from more than 10 modules |
| `drift/promise-style-mix` | warn | Mixed async/await and .then() |
| `drift/unused-export` | warn | Exports never imported anywhere |
| `drift/dead-file` | warn | Files never imported |
| `drift/unused-dependency` | warn | Packages in package.json never used |
| `drift/cross-boundary-import` | warn | Cross-module boundary imports |
| `drift/hardcoded-config` | warn | Hardcoded URLs, IPs, connection strings |
| `drift/inconsistent-error-handling` | warn | Mixed try/catch and .catch() |
| `drift/unnecessary-abstraction` | warn | Single-use interfaces and abstract classes |
| `drift/naming-inconsistency` | warn | Mixed camelCase and snake_case |
| `drift/no-return-type` | warn | Missing explicit return types |
| `drift/magic-number` | warn | Numeric literals in logic |
| `drift/over-commented` | warn | Comments exceed 40% of function lines |

## How it works

The plugin runs drift's AST analysis engine on each `.ts`/`.tsx` file when ESLint processes it. Results are cached per file so each file is analyzed once regardless of how many rules are enabled.

> **Note:** This plugin analyzes files individually. Cross-file rules (`unused-export`, `dead-file`, `unused-dependency`) work best when running `drift scan` on the full project for comprehensive cross-file analysis.

## Requirements

- ESLint 9+
- Node.js 18+
- TypeScript or JavaScript project

## License

MIT — [Eduard Barrera](https://github.com/eduardbar)
