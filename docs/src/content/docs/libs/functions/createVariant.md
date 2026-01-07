---
title: createVariant
editUrl: false
next: true
prev: true
---

> **createVariant**\<`T`\>(`variant`): [`CandidVariant`](../type-aliases/CandidVariant.md)\<`T`\>

Defined in: [utils/candid.ts:22](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/utils/candid.ts#L22)

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
