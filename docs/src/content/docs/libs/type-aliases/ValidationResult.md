---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [display-reactor.ts:30](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/display-reactor.ts#L30)

Validation result returned by a validator function.
Either success (true) or failure with issues.
