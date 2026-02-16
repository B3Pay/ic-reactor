---
title: AsDisplayArgs
editUrl: false
next: true
prev: true
---

> **AsDisplayArgs**\<`T`\> = `T` _extends_ readonly `unknown`[] ? `{ [K in keyof T]: DisplayOf<T[K]> }` : [`DisplayOf`](DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:103](https://github.com/B3Pay/ic-reactor/blob/19301fd54c59786a0db96c42a8e480ee185a81be/packages/core/src/types/reactor.ts#L103)

Helper type to transform args array elements using ToDisplay

## Type Parameters

### T

`T`
