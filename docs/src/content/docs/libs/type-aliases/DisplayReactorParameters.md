---
title: DisplayReactorParameters
editUrl: false
next: true
prev: true
---

> **DisplayReactorParameters**\<`A`\> = [`ReactorParameters`](ReactorParameters.md)\<`A`\> & `object`

Defined in: [display-reactor.ts:76](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/display-reactor.ts#L76)

## Type Declaration

### validators?

> `optional` **validators**: `Partial`\<`{ [M in FunctionName<A>]: DisplayValidator<A, M> }`\>

Optional initial validators to register.
Validators receive display types (strings for Principal, bigint, etc.)

## Type Parameters

### A

`A` = [`BaseActor`](BaseActor.md)
