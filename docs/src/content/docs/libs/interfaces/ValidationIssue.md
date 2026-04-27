---
title: ValidationIssue
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:183](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/errors/index.ts#L183)

Represents a single validation issue

## Properties

### path

> **path**: (`string` \| `number`)[]

Defined in: [errors/index.ts:185](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/errors/index.ts#L185)

Path to the invalid field (e.g., ["to", "amount"])

---

### message

> **message**: `string`

Defined in: [errors/index.ts:187](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/errors/index.ts#L187)

Human-readable error message

---

### code?

> `optional` **code?**: `string`

Defined in: [errors/index.ts:189](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/errors/index.ts#L189)

Validation code (e.g., "required", "min_length")
