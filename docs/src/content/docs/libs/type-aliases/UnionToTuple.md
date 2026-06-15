---
title: UnionToTuple
editUrl: false
next: true
prev: true
---

> **UnionToTuple**\<`T`, `L`\> = \[`T`\] _extends_ \[`never`\] ? \[\] : \[`...UnionToTuple<Exclude<T, L>>`, `L`\]

Defined in: [core/src/types/transform.ts:17](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/types/transform.ts#L17)

## Type Parameters

### T

`T`

### L

`L` = `Last`\<`T`\>
