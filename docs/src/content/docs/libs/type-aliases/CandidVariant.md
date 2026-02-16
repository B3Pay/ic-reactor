---
title: CandidVariant
editUrl: false
next: true
prev: true
---

> **CandidVariant**\<`T`\> = [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `object` & `{ [K in CandidVariantKey<T> & string as CandidVariantValue<T, K> extends null ? never : K]: CandidVariantValue<T, K> }` : `T`

Defined in: [types/variant.ts:16](https://github.com/B3Pay/ic-reactor/blob/1ad0d6bf29dfde414a8adc8f90acf0e842bdda09/packages/core/src/types/variant.ts#L16)

## Type Parameters

### T

`T`
