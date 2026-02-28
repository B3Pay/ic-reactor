---
title: getVariantKeyValue
editUrl: false
next: true
prev: true
---

> **getVariantKeyValue**\<`T`\>(`variant`): [`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

Defined in: [utils/candid.ts:51](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/utils/candid.ts#L51)

Extract variant key and value from a variant type
Works with types like:
type User = { 'Business': BusinessUser } | { 'Individual': IndividualUser }

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `any`\>

The variant type

## Parameters

### variant

`T`

## Returns

[`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

A tuple containing the key and value of the variant

## Throws

Error if the variant object does not have exactly one key
