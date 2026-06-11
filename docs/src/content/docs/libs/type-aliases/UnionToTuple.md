---
title: UnionToTuple
editUrl: false
next: true
prev: true
---

> **UnionToTuple**\<`T`, `L`\> = \[`T`\] _extends_ \[`never`\] ? \[\] : \[`...UnionToTuple<Exclude<T, L>>`, `L`\]

Defined in: [core/src/types/transform.ts:17](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/transform.ts#L17)

## Type Parameters

### T

`T`

### L

`L` = `Last`\<`T`\>
