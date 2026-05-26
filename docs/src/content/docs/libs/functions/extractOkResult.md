---
editUrl: false
next: true
prev: true
---

> **extractOkResult**\<`T`\>(`result`): [`OkResult`](../type-aliases/OkResult.md)\<`T`\>

Defined in: [core/src/utils/helper.ts:85](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/utils/helper.ts#L85)

Helper function for extracting the value from a compiled result { Ok: T } or throw a CanisterError if { Err: E }
Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko) conventions.

## Type Parameters

### T

`T`

## Parameters

### result

`T`

The compiled result to extract from.

## Returns

[`OkResult`](../type-aliases/OkResult.md)\<`T`\>

The extracted value from the compiled result.

## Throws

CanisterError with the typed error value if result is { Err: E } or { err: E }
