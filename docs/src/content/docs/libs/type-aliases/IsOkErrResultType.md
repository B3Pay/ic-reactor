---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `T` *extends* `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
