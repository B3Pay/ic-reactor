---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
