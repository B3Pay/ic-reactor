---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` _extends_ readonly \[infer U\] ? `U` : `T` _extends_ readonly \[\] ? `null` : `T`

Defined in: [core/src/types/reactor.ts:70](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/reactor.ts#L70)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
