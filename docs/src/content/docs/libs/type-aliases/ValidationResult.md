---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [types/display-reactor.ts:17](https://github.com/B3Pay/ic-reactor/blob/19301fd54c59786a0db96c42a8e480ee185a81be/packages/core/src/types/display-reactor.ts#L17)

Validation result returned by a validator function.
Either success (true) or failure with issues.
