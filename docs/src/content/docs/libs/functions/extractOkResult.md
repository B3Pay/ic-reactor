---
title: extractOkResult
editUrl: false
next: true
prev: true
---

> **extractOkResult**\<`T`\>(`result`): [`OkResult`](../type-aliases/OkResult.md)\<`T`\>

Defined in: [utils/helper.ts:56](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/utils/helper.ts#L56)

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
