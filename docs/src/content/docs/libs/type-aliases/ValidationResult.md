---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [core/src/types/display-reactor.ts:17](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/types/display-reactor.ts#L17)

Validation result returned by a validator function.
Either success (true) or failure with issues.
