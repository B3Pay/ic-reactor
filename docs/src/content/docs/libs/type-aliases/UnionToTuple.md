---
title: UnionToTuple
editUrl: false
next: true
prev: true
---

> **UnionToTuple**\<`T`, `L`\> = \[`T`\] _extends_ \[`never`\] ? \[\] : \[`...UnionToTuple<Exclude<T, L>>`, `L`\]

Defined in: [core/src/types/transform.ts:17](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/transform.ts#L17)

## Type Parameters

### T

`T`

### L

`L` = `Last`\<`T`\>
