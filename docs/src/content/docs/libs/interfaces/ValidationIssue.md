---
title: ValidationIssue
editUrl: false
next: true
prev: true
---

Defined in: [core/src/errors/index.ts:183](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/errors/index.ts#L183)

Represents a single validation issue

## Properties

### path

> **path**: (`string` \| `number`)[]

Defined in: [core/src/errors/index.ts:185](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/errors/index.ts#L185)

Path to the invalid field (e.g., ["to", "amount"])

---

### message

> **message**: `string`

Defined in: [core/src/errors/index.ts:187](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/errors/index.ts#L187)

Human-readable error message

---

### code?

> `optional` **code?**: `string`

Defined in: [core/src/errors/index.ts:189](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/errors/index.ts#L189)

Validation code (e.g., "required", "min_length")
