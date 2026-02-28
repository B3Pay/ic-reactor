---
title: Validator
editUrl: false
next: true
prev: true
---

> **Validator**\<`Args`\> = (`args`) => [`ValidationResult`](ValidationResult.md) \| `Promise`\<[`ValidationResult`](ValidationResult.md)\>

Defined in: [types/display-reactor.ts:48](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/display-reactor.ts#L48)

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
