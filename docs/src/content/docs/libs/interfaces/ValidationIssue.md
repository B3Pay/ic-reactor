---
title: ValidationIssue
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:176](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/errors/index.ts#L176)

Represents a single validation issue

## Properties

### path

> **path**: (`string` \| `number`)[]

Defined in: [errors/index.ts:178](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/errors/index.ts#L178)

Path to the invalid field (e.g., ["to", "amount"])

---

### message

> **message**: `string`

Defined in: [errors/index.ts:180](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/errors/index.ts#L180)

Human-readable error message

---

### code?

> `optional` **code**: `string`

Defined in: [errors/index.ts:182](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/errors/index.ts#L182)

Validation code (e.g., "required", "min_length")
