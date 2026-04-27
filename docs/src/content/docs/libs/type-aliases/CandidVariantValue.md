---
title: CandidVariantValue
editUrl: false
next: true
prev: true
---

> **CandidVariantValue**\<`T`, `K`\> = `T` _extends_ `Record`\<`K`, infer U\> ? `U` : `T` _extends_ `object` ? `null` : `never`

Defined in: [types/variant.ts:15](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/variant.ts#L15)

## Type Parameters

### T

`T`

### K

`K` _extends_ [`CandidVariantKey`](CandidVariantKey.md)\<`T`\>
