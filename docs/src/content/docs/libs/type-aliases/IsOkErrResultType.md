---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `false`

Defined in: [core/src/types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
