---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` _extends_ readonly \[infer U\] ? `U` : `T` _extends_ readonly \[\] ? `null` : `T`

Defined in: [types/reactor.ts:80](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/types/reactor.ts#L80)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
