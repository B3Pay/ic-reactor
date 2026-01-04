---
title: UnionToTuple
editUrl: false
next: true
prev: true
---

> **UnionToTuple**\<`T`, `L`\> = \[`T`\] _extends_ \[`never`\] ? \[\] : \[`...UnionToTuple<Exclude<T, L>>`, `L`\]

Defined in: [types/transform.ts:17](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/types/transform.ts#L17)

## Type Parameters

### T

`T`

### L

`L` = `Last`\<`T`\>
