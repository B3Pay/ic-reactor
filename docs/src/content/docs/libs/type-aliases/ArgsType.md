---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` _extends_ readonly \[infer U\] ? `U` : `T` _extends_ readonly \[\] ? `null` : `T`

Defined in: [types/reactor.ts:80](https://github.com/B3Pay/ic-reactor/blob/0a4ee079190c394020352bc5fe7d6a82602b17f1/packages/core/src/types/reactor.ts#L80)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
