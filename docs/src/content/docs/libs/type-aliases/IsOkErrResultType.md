---
title: IsOkErrResultType
editUrl: false
next: true
prev: true
---

> **IsOkErrResultType**\<`T`\> = `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `T` _extends_ `object` ? `true` : `false`

Defined in: [types/result.ts:42](https://github.com/B3Pay/ic-reactor/blob/1ad0d6bf29dfde414a8adc8f90acf0e842bdda09/packages/core/src/types/result.ts#L42)

Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })

## Type Parameters

### T

`T`
