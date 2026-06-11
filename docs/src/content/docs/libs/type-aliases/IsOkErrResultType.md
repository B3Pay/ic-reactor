---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `false`

Defined in: [core/src/types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
