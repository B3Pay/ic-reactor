---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
