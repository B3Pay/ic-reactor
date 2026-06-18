---
title: ValidationIssue
editUrl: false
next: true
prev: true
---

Defined in: [core/src/errors/index.ts:183](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/errors/index.ts#L183)

Represents a single validation issue

## Properties

### path

> **path**: (`string` \| `number`)[]

Defined in: [core/src/errors/index.ts:185](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/errors/index.ts#L185)

Path to the invalid field (e.g., ["to", "amount"])

---

### message

> **message**: `string`

Defined in: [core/src/errors/index.ts:187](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/errors/index.ts#L187)

Human-readable error message

---

### code?

> `optional` **code?**: `string`

Defined in: [core/src/errors/index.ts:189](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/errors/index.ts#L189)

Validation code (e.g., "required", "min_length")
