---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [core/src/types/display-reactor.ts:17](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/display-reactor.ts#L17)

Validation result returned by a validator function.
Either success (true) or failure with issues.
