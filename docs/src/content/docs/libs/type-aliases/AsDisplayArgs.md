---
title: AsDisplayArgs
editUrl: false
next: true
prev: true
---

> **AsDisplayArgs**\<`T`\> = `T` _extends_ readonly `unknown`[] ? `{ [K in keyof T]: DisplayOf<T[K]> }` : [`DisplayOf`](DisplayOf.md)\<`T`\>

Defined in: [core/src/types/reactor.ts:103](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/reactor.ts#L103)

Helper type to transform args array elements using ToDisplay

## Type Parameters

### T

`T`
