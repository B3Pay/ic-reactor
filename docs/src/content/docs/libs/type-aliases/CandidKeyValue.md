---
title: CandidKeyValue
editUrl: false
next: true
prev: true
---

> **CandidKeyValue**\<`T`\> = `T` _extends_ infer U ? \[[`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`, [`CandidVariantValue`](CandidVariantValue.md)\<`U`, [`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`\>\] : `never`

Defined in: [types/variant.ts:34](https://github.com/B3Pay/ic-reactor/blob/1ad0d6bf29dfde414a8adc8f90acf0e842bdda09/packages/core/src/types/variant.ts#L34)

A type that represents the extracted key and value from a variant
Designed to be used with the extractVariant function

## Type Parameters

### T

`T`
