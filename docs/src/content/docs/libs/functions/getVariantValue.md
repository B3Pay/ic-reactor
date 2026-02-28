---
title: getVariantValue
editUrl: false
next: true
prev: true
---

> **getVariantValue**\<`T`, `K`\>(`variant`): [`CandidVariantValue`](../type-aliases/CandidVariantValue.md)\<`T`, `K`\>

Defined in: [utils/candid.ts:88](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/utils/candid.ts#L88)

Extracts the value from a Candid variant type.

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `any`\>

### K

`K` *extends* `string` = [`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

## Parameters

### variant

`T`

The variant object

## Returns

[`CandidVariantValue`](../type-aliases/CandidVariantValue.md)\<`T`, `K`\>

The value associated with the variant's key
