---
title: OkResult
editUrl: false
next: true
prev: true
---

> **OkResult**\<`T`\> = `T` *extends* `object` ? `never` : `T` *extends* `object` ? `never` : `T` *extends* `object` ? `U` : `T` *extends* `object` ? `U` : `T`

Defined in: [types/result.ts:19](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/result.ts#L19)

Extract the Ok value from a Result type.
Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko).
- If T is { Ok: U } or { ok: U }, returns U
- If T is { Err: E } or { err: E }, returns never (filters it out from unions)
- If T is { Ok: U } | { Err: E }, returns U (the Err variant is filtered out)
- Otherwise, returns T as-is

## Type Parameters

### T

`T`
