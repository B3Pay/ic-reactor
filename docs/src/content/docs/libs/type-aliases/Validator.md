---
title: Validator
editUrl: false
next: true
prev: true
---

> **Validator**\<`Args`\> = (`args`) => [`ValidationResult`](ValidationResult.md) \| `Promise`\<[`ValidationResult`](ValidationResult.md)\>

Defined in: [types/display-reactor.ts:48](https://github.com/B3Pay/ic-reactor/blob/4d02e8d8d928d42fa1d6f6a89a0eba4531459b4e/packages/core/src/types/display-reactor.ts#L48)

A validator function that validates method arguments.
Receives display types (strings for Principal, bigint, etc.).

## Type Parameters

### Args

`Args` = `unknown`[]

## Parameters

### args

`Args`

The display-type arguments to validate

## Returns

[`ValidationResult`](ValidationResult.md) \| `Promise`\<[`ValidationResult`](ValidationResult.md)\>

ValidationResult indicating success or failure with issues

## Example

```typescript
// Validator receives display types
reactor.registerValidator("transfer", ([input]) => {
  const issues = []

  // input.to is string (not Principal)
  if (!input.to) {
    issues.push({ path: ["to"], message: "Recipient is required" })
  }

  // input.amount is string (not bigint)
  if (!/^\d+$/.test(input.amount)) {
    issues.push({ path: ["amount"], message: "Must be a valid number" })
  }

  return issues.length > 0 ? { success: false, issues } : { success: true }
})
```
