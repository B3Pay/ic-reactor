---
title: getVariantKeyValue
editUrl: false
next: true
prev: true
---

> **getVariantKeyValue**\<`T`\>(`variant`): [`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

Defined in: [utils/candid.ts:51](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/utils/candid.ts#L51)

Extract variant key and value from a variant type
Works with types like:
type User = { 'Business': BusinessUser } | { 'Individual': IndividualUser }

## Type Parameters

### T

`T` _extends_ `Record`\<`string`, `any`\>

The variant type

## Parameters

### variant

`T`

## Returns

[`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

A tuple containing the key and value of the variant

## Throws

Error if the variant object does not have exactly one key
