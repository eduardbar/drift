# Pull Request

## Type

- [ ] Bug fix
- [ ] New detection rule
- [ ] New CLI feature
- [ ] Refactor / performance
- [ ] Docs
- [ ] Other

## Summary

<!-- What does this PR do and why? 1–3 sentences max. -->

## Changes

- 
- 

## New rule checklist (skip if not applicable)

- [ ] Entry added to `RULE_WEIGHTS` in `src/analyzer.ts`
- [ ] Detection logic implemented using ts-morph AST
- [ ] `fix_suggestion` added for the rule in `src/printer.ts`
- [ ] Rule documented in `README.md` (What it detects table)
- [ ] Rule documented in `AGENTS.md` (Rules table)

## Testing

```bash
# Command you ran to verify this works
npx @eduardbar/drift scan ./src
```

<!-- Paste the relevant part of the output. -->

## Breaking changes

<!-- Does this change the score of existing scans, remove a flag, or change output format?
     If yes, describe the impact. -->

## Commit convention

This PR follows [Conventional Commits](https://www.conventionalcommits.org/).
All commits are in the format `type(scope): description`.
