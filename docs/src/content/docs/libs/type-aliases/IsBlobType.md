---
title: IsBlobType
editUrl: false
next: true
prev: true
---

> **IsBlobType**\<`T`\> = `T` *extends* `Uint8Array` ? `true` : `T` *extends* `number`[] ? `number`[] *extends* `T` ? `true` : `false` : `false`

Defined in: [types/transform.ts:21](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/transform.ts#L21)

## Type Parameters

### T

`T`
