---
title: getVariantKey
editUrl: false
next: true
prev: true
---

> **getVariantKey**\<`T`\>(`variant`): [`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

Defined in: [utils/candid.ts:71](https://github.com/B3Pay/ic-reactor/blob/88126d5d2dfbc2b99d2902449702514e86b6784e/packages/core/src/utils/candid.ts#L71)

Extracts the key from a Candid variant type.
Variants in Candid are represented as objects with a single key-value pair.

## Type Parameters

### T

`T` _extends_ `Record`\<`string`, `any`\>

## Parameters

### variant

`T`

The variant object

## Returns

[`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

The key of the variant
