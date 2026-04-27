---
title: getVariantValue
editUrl: false
next: true
prev: true
---

> **getVariantValue**\<`T`, `K`\>(`variant`): [`CandidVariantValue`](../type-aliases/CandidVariantValue.md)\<`T`, `K`\>

Defined in: [utils/candid.ts:120](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/utils/candid.ts#L120)

Extracts the value from a Candid variant type.
Supports both raw Candid variants and display variants.

## Type Parameters

### T

`T` _extends_ `Record`\<`string`, `any`\>

### K

`K` _extends_ `string` = [`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

## Parameters

### variant

`T`

The variant object

## Returns

[`CandidVariantValue`](../type-aliases/CandidVariantValue.md)\<`T`, `K`\>

The value associated with the variant's key
