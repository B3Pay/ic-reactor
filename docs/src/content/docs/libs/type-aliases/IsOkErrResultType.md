---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
