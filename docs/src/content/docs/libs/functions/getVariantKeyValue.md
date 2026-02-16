---
title: getVariantKeyValue
editUrl: false
next: true
prev: true
---

> **getVariantKeyValue**\<`T`\>(`variant`): [`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

Defined in: [utils/candid.ts:51](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/utils/candid.ts#L51)

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
