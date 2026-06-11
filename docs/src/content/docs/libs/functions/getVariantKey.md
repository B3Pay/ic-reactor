---
title: getVariantKey
editUrl: false
next: true
prev: true
---

> **getVariantKey**\<`T`\>(`variant`): [`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

Defined in: [core/src/utils/candid.ts:108](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/utils/candid.ts#L108)

Extracts the key from a Candid variant type.
Supports both raw Candid variants ({ Ok: value }) and display variants
({ \_type: "Ok", Ok: value }).

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
