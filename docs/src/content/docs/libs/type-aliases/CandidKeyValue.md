---
title: CandidKeyValue
editUrl: false
next: true
prev: true
---

> **CandidKeyValue**\<`T`\> = `T` _extends_ infer U ? \[[`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`, [`CandidVariantValue`](CandidVariantValue.md)\<`U`, [`CandidVariantKey`](CandidVariantKey.md)\<`U`\> & `string`\>\] : `never`

Defined in: [core/src/types/variant.ts:36](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/types/variant.ts#L36)

A type that represents the extracted key and value from a variant
Designed to be used with the extractVariant function

## Type Parameters

### T

`T`
