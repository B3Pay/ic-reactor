---
title: AsDisplayArgs
editUrl: false
next: true
prev: true
---

> **AsDisplayArgs**\<`T`\> = `T` *extends* readonly `unknown`[] ? `{ [K in keyof T]: DisplayOf<T[K]> }` : [`DisplayOf`](DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:103](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/reactor.ts#L103)

Helper type to transform args array elements using ToDisplay

## Type Parameters

### T

`T`
