---
title: CandidVariant
editUrl: false
next: true
prev: true
---

> **CandidVariant**\<`T`\> = [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `object` & `{ [K in CandidVariantKey<T> & string as CandidVariantValue<T, K> extends null ? never : K]: CandidVariantValue<T, K> }` : `T`

Defined in: [core/src/types/variant.ts:18](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/variant.ts#L18)

## Type Parameters

### T

`T`
