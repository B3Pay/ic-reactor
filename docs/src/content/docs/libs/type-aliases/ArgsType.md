---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` *extends* readonly \[infer U\] ? `U` : `T` *extends* readonly \[\] ? `null` : `T`

Defined in: [types/reactor.ts:70](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/reactor.ts#L70)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
