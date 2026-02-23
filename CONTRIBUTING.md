# Contributing to drift

First off — thanks for taking the time. drift is built on the idea that the community knows best what patterns AI leaves behind, and every rule added here helps every TypeScript developer who runs this.

## How to contribute

### Report a bug

Open an issue using the **Bug Report** template. Include:
- The command you ran
- What you expected vs what happened
- Your Node.js version and OS

### Suggest a new rule

This is the most valuable contribution. If you keep seeing a specific AI-generated pattern that drift doesn't catch yet, open an issue using the **Rule Request** template with:
- A short description of the pattern
- A real code snippet that triggers it (anonymized is fine)
- Why it's harmful or a sign of AI-generated debt

### Submit a PR

```bash
# 1. Fork and clone
git clone https://github.com/eduardbar/drift
cd drift

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Create a branch
git checkout -b feat/rule-name
# or
git checkout -b fix/issue-description
```

#### Adding a new rule

1. Add the rule weight in `RULE_WEIGHTS` in `src/analyzer.ts`:
   ```typescript
   const RULE_WEIGHTS: Record<string, number> = {
     'your-rule-name': 10, // weight between 1 and 20
   }
   ```

2. Implement the detection logic in `analyzeFile()` using ts-morph AST traversal.

3. Add a fix suggestion in `src/printer.ts`:
   ```typescript
   const FIX_SUGGESTIONS: Record<string, string[]> = {
     'your-rule-name': [
       'First suggestion',
       'Alternative suggestion',
     ],
   }
   ```

4. Update the rules table in `README.md`.

5. Run drift on itself to make sure nothing breaks:
   ```bash
   node dist/cli.js scan ./src
   ```

6. Open a PR with a clear description of what the rule detects and why it matters.

#### Commit convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(analyzer): add high-complexity rule for cyclomatic detection
fix(printer): align snippet indentation for long file paths
docs(readme): add rule description for deep-nesting
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `ci`, `test`

### What makes a good rule

A good drift rule:
- Detects a **specific, reproducible** pattern — not a matter of style preference
- Has a **measurable signal** that AI tools leave this more than humans do
- Is **false-positive resistant** — it should almost never fire on intentional code
- Can be **ignored with `// drift-ignore`** when the pattern is intentional

### What drift is NOT

drift is not a linter for style or correctness. That's ESLint's job and it does it well.

drift detects patterns that are:
- Syntactically correct
- Pass linting
- But accumulate into a codebase no one can maintain

If your contribution overlaps with an ESLint rule, it probably doesn't belong in drift.

## Development setup

```bash
npm install       # install dependencies
npm run build     # compile TypeScript → dist/
npm run dev       # watch mode
node dist/cli.js scan ./src  # run on the project itself
```

## Questions?

Open a [Discussion](https://github.com/eduardbar/drift/discussions) — not an issue. Issues are for bugs and rule requests.
