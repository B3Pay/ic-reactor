---
title: extractOkResult
editUrl: false
next: true
prev: true
---

> **extractOkResult**\<`T`\>(`result`): [`OkResult`](../type-aliases/OkResult.md)\<`T`\>

Defined in: [utils/helper.ts:75](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/utils/helper.ts#L75)

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
