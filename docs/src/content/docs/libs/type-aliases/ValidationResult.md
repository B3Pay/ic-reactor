---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [display-reactor.ts:30](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/display-reactor.ts#L30)

Validation result returned by a validator function.
Either success (true) or failure with issues.
