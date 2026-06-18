---
title: CandidVariantValue
editUrl: false
next: true
prev: true
---

> **CandidVariantValue**\<`T`, `K`\> = `T` _extends_ `Record`\<`K`, infer U\> ? `U` : `T` _extends_ `object` ? `null` : `never`

Defined in: [core/src/types/variant.ts:15](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/variant.ts#L15)

## Type Parameters

### T

`T`

### K

`K` _extends_ [`CandidVariantKey`](CandidVariantKey.md)\<`T`\>
