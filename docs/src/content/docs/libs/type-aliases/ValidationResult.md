---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [display-reactor.ts:30](https://github.com/B3Pay/ic-reactor/blob/0a4ee079190c394020352bc5fe7d6a82602b17f1/packages/core/src/display-reactor.ts#L30)

Validation result returned by a validator function.
Either success (true) or failure with issues.
