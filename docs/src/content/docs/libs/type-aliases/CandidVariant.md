---
title: CandidVariant
editUrl: false
next: true
prev: true
---

> **CandidVariant**\<`T`\> = [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `object` & `{ [K in CandidVariantKey<T> & string as CandidVariantValue<T, K> extends null ? never : K]: CandidVariantValue<T, K> }` : `T`

Defined in: [types/variant.ts:16](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/variant.ts#L16)

## Type Parameters

### T

`T`
