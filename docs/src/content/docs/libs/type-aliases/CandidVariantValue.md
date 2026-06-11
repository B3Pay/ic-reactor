---
title: CandidVariantValue
editUrl: false
next: true
prev: true
---

> **CandidVariantValue**\<`T`, `K`\> = `T` _extends_ `Record`\<`K`, infer U\> ? `U` : `T` _extends_ `object` ? `null` : `never`

Defined in: [core/src/types/variant.ts:15](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/core/src/types/variant.ts#L15)

## Type Parameters

### T

`T`

### K

`K` _extends_ [`CandidVariantKey`](CandidVariantKey.md)\<`T`\>
