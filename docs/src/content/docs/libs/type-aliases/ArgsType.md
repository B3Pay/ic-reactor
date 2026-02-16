---
title: ArgsType
editUrl: false
next: true
prev: true
---

> **ArgsType**\<`T`\> = `T` _extends_ readonly \[infer U\] ? `U` : `T` _extends_ readonly \[\] ? `null` : `T`

Defined in: [types/reactor.ts:70](https://github.com/B3Pay/ic-reactor/blob/19301fd54c59786a0db96c42a8e480ee185a81be/packages/core/src/types/reactor.ts#L70)

Helper to extract arguments type for codecs (unwraps single argument tuples).

## Type Parameters

### T

`T`
