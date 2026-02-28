---
title: getVariantKey
editUrl: false
next: true
prev: true
---

> **getVariantKey**\<`T`\>(`variant`): [`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

Defined in: [utils/candid.ts:71](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/utils/candid.ts#L71)

Extracts the key from a Candid variant type.
Variants in Candid are represented as objects with a single key-value pair.

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `any`\>

## Parameters

### variant

`T`

The variant object

## Returns

[`CandidVariantKey`](../type-aliases/CandidVariantKey.md)\<`T`\>

The key of the variant
