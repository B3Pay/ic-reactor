---
title: ReactorQueryParams
editUrl: false
next: true
prev: true
---

Defined in: [core/src/types/reactor.ts:168](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/reactor.ts#L168)

Basic query parameters for reactor cache operations.
Used by: generateQueryKey, getQueryData

## Extended by

- [`ReactorCallParams`](ReactorCallParams.md)

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](../type-aliases/FunctionName.md)\<`A`\>

### T

`T` _extends_ [`TransformKey`](../type-aliases/TransformKey.md) = `"candid"`

## Properties

### functionName

> **functionName**: `M`

Defined in: [core/src/types/reactor.ts:173](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/reactor.ts#L173)

---

### args?

> `optional` **args?**: [`ReactorArgs`](../type-aliases/ReactorArgs.md)\<`A`, `M`, `T`\>

Defined in: [core/src/types/reactor.ts:174](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/reactor.ts#L174)

---

### queryKey?

> `optional` **queryKey?**: readonly `unknown`[]

Defined in: [core/src/types/reactor.ts:175](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/types/reactor.ts#L175)
