---
title: AsDisplayArgs
editUrl: false
next: true
prev: true
---

> **AsDisplayArgs**\<`T`\> = `T` _extends_ readonly `unknown`[] ? `{ [K in keyof T]: DisplayOf<T[K]> }` : [`DisplayOf`](DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:103](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L103)

Helper type to transform args array elements using ToDisplay

## Type Parameters

### T

`T`
