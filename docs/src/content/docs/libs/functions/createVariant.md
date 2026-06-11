---
title: createVariant
editUrl: false
next: true
prev: true
---

> **createVariant**\<`T`\>(`variant`): [`CandidVariant`](../type-aliases/CandidVariant.md)\<`T`\>

Defined in: [core/src/utils/candid.ts:64](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/utils/candid.ts#L64)

Creates a Candid variant from a record.

## Type Parameters

### T

`T` _extends_ `Record`\<`string`, `any`\>

## Parameters

### variant

`T`

The record to convert into a variant

## Returns

[`CandidVariant`](../type-aliases/CandidVariant.md)\<`T`\>

An object representing the Candid variant
