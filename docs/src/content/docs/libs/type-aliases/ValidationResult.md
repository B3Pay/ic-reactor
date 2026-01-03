---
title: ValidationResult
editUrl: false
next: true
prev: true
---

> **ValidationResult** = \{ `success`: `true`; \} \| \{ `success`: `false`; `issues`: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]; \}

Defined in: [display-reactor.ts:30](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/display-reactor.ts#L30)

Validation result returned by a validator function.
Either success (true) or failure with issues.
