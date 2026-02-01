---
title: getVariantValue
editUrl: false
next: true
prev: true
---

> **getVariantValue**\<`T`, `K`\>(`variant`): [`CandidVariantValue`](../type-aliases/CandidVariantValue.md)\<`T`, `K`\>

Defined in: [utils/candid.ts:88](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/candid.ts#L88)

Extracts the value from a Candid variant type.

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
