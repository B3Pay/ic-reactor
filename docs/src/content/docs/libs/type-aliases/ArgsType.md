---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` _extends_ readonly \[infer U\] ? `U` : `T` _extends_ readonly \[\] ? `null` : `T`

Defined in: [types/reactor.ts:70](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/reactor.ts#L70)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
