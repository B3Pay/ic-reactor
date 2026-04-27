---
title: getVariantKeyValue
editUrl: false
next: true
prev: true
---

> **getVariantKeyValue**\<`T`\>(`variant`): [`CandidKeyValue`](../type-aliases/CandidKeyValue.md)\<`T`\>

Defined in: [utils/candid.ts:95](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/utils/candid.ts#L95)

Extract variant key and value from a variant type
Works with types like:
type User = { 'Business': BusinessUser } | { 'Individual': IndividualUser }
Also supports display variants shaped like:
{ \_type: "Business", Business: value } or { \_type: "Individual" }

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

Error if the variant object is malformed
