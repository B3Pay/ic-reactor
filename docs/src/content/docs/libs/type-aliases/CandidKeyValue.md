---
title: CandidKeyValue
editUrl: false
next: true
prev: true
---

> **CandidKeyValue**\<`T`\> = `T` _extends_ infer U ? \[[`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`, [`CandidVariantValue`](CandidVariantValue.md)\<`U`, [`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`\>\] : `never`

Defined in: [types/variant.ts:34](https://github.com/B3Pay/ic-reactor/blob/7036734963f96dc0d6af031acb9e17758f8a7cd1/packages/core/src/types/variant.ts#L34)

A type that represents the extracted key and value from a variant
Designed to be used with the extractVariant function

## Type Parameters

### T

`T`
