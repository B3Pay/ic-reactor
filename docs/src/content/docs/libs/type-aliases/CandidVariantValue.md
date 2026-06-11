---
title: CandidVariantValue
editUrl: false
next: true
prev: true
---

> **CandidVariantValue**\<`T`, `K`\> = `T` _extends_ `Record`\<`K`, infer U\> ? `U` : `T` _extends_ `object` ? `null` : `never`

Defined in: [core/src/types/variant.ts:15](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/variant.ts#L15)

## Type Parameters

### T

`T`

### K

`K` _extends_ [`CandidVariantKey`](CandidVariantKey.md)\<`T`\>
