---
title: OkResult
editUrl: false
next: true
prev: true
---

> **OkResult**\<`T`\> = `T` _extends_ `object` ? `never` : `T` _extends_ `object` ? `never` : `T` _extends_ `object` ? `U` : `T` _extends_ `object` ? `U` : `T`

Defined in: [types/result.ts:19](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/result.ts#L19)

Extract the Ok value from a Result type.
Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko).

- If T is { Ok: U } or { ok: U }, returns U
- If T is { Err: E } or { err: E }, returns never (filters it out from unions)
- If T is { Ok: U } | { Err: E }, returns U (the Err variant is filtered out)
- Otherwise, returns T as-is

## Type Parameters

### T

`T`
