---
title: UnionToTuple
editUrl: false
next: true
prev: true
---

> **UnionToTuple**\<`T`, `L`\> = \[`T`\] _extends_ \[`never`\] ? \[\] : \[`...UnionToTuple<Exclude<T, L>>`, `L`\]

Defined in: [core/src/types/transform.ts:17](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/transform.ts#L17)

## Type Parameters

### T

`T`

### L

`L` = `Last`\<`T`\>
