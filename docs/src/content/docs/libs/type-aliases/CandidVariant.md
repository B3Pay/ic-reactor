---
title: CandidVariant
editUrl: false
next: true
prev: true
---

> **CandidVariant**\<`T`\> = [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `object` & `{ [K in CandidVariantKey<T> & string as CandidVariantValue<T, K> extends null ? never : K]: CandidVariantValue<T, K> }` : `T`

Defined in: [types/variant.ts:16](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/variant.ts#L16)

## Type Parameters

### T

`T`
