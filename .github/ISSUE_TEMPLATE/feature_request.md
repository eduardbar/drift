---
name: Feature request
about: Propose a new detection rule or CLI feature
title: "feat: "
labels: enhancement
assignees: ""
---

## Problem

<!-- What specific AI-generated pattern or technical debt is NOT currently detected?
     Or what workflow friction does this feature address? -->

## Proposed solution

<!-- Describe the rule or feature. If it's a new detection rule, include:
     - Rule name (kebab-case)
     - Severity: error | warning | info
     - Suggested weight (1–20)
     - What it detects and why it matters -->

## Example

```typescript
// Code that SHOULD trigger the new rule
function example() {
  // ...
}
```

## Why drift and not ESLint

<!-- drift is NOT an ESLint replacement. It targets patterns ESLint can't catch:
     architectural violations, AI-specific habits, historical debt trends.
     Explain why this belongs in drift. -->

## Additional context

<!-- Links, references, real-world examples that motivated this request. -->
