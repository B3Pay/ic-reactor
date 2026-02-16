---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [types/display-reactor.ts:17](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/display-reactor.ts#L17)

Validation result returned by a validator function.
Either success (true) or failure with issues.
