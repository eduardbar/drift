# Drift Plugin Contract (v2)

This document defines the external plugin contract for `@eduardbar/drift`.

## Minimal plugin shape

```js
module.exports = {
  name: 'my-plugin',
  apiVersion: 1,
  capabilities: {
    fixes: true,
    tags: 'security',
  },
  rules: [
    {
      id: 'no-debug-leftovers',
      severity: 'warning',
      weight: 8,
      detect(file, context) {
        return []
      },
      fix(issue, file, context) {
        return issue
      },
    },
  ],
}
```

## Contract rules

- `name`: required non-empty string.
- `apiVersion`: recommended and currently supported value is `1`.
- `capabilities`: optional object map with primitive values (`string | number | boolean`).
- `rules`: required array with at least one valid rule.
- Rule `id` (or legacy `name` fallback):
  - for `apiVersion: 1` must match `^[a-z][a-z0-9]*(?:[-_/][a-z0-9]+)*$`
  - must be unique within the plugin.
- `detect(file, context)`: required function returning `DriftIssue[]`.

## Legacy compatibility

- Plugins without `apiVersion` still load for backward compatibility.
- Drift emits warning code `plugin-api-version-implicit` and assumes compatibility mode.
- In compatibility mode, non-standard rule IDs are warnings (`plugin-rule-id-format-legacy`) instead of hard errors.

## Failure isolation

- Invalid plugin contracts are skipped and reported as diagnostics.
- Runtime errors thrown by one plugin rule are isolated to that rule; scan continues for other rules/files.

## Common diagnostic codes

- `plugin-api-version-implicit`: missing `apiVersion`; plugin loaded in legacy mode.
- `plugin-api-version-invalid`: `apiVersion` is not a positive integer.
- `plugin-api-version-unsupported`: plugin version is not supported by current drift runtime.
- `plugin-rule-id-invalid`: rule ID format invalid for explicit API version.
- `plugin-rule-id-duplicate`: duplicate rule ID inside the same plugin.
- `plugin-capabilities-invalid`: `capabilities` is not an object.
- `plugin-capabilities-value-invalid`: capability value is not a primitive.
