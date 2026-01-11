---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
