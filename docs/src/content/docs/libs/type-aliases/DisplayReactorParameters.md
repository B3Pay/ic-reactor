---
title: DisplayReactorParameters
editUrl: false
next: true
prev: true
---

> **DisplayReactorParameters**\<`A`\> = [`ReactorParameters`](../interfaces/ReactorParameters.md) & `object`

Defined in: [types/display-reactor.ts:63](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/types/display-reactor.ts#L63)

## Type Declaration

### validators?

> `optional` **validators**: `Partial`\<`{ [M in FunctionName<A>]: DisplayValidator<A, M> }`\>

Optional initial validators to register.
Validators receive display types (strings for Principal, bigint, etc.)

## Type Parameters

### A

`A` = [`BaseActor`](BaseActor.md)
