---
title: ReactorCallParams
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:188](https://github.com/B3Pay/ic-reactor/blob/2c4a4d6d0734eef45eb58617a4984eddfb64f9d9/packages/core/src/types/reactor.ts#L188)

Query parameters with optional call configuration.
Used by: getQueryOptions, fetchQuery, callMethod

## Extends

- [`ReactorQueryParams`](ReactorQueryParams.md)\<`A`, `M`, `T`\>

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

Defined in: [types/reactor.ts:179](https://github.com/B3Pay/ic-reactor/blob/2c4a4d6d0734eef45eb58617a4984eddfb64f9d9/packages/core/src/types/reactor.ts#L179)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`functionName`](ReactorQueryParams.md#functionname)

---

### args?

> `optional` **args**: [`ReactorArgs`](../type-aliases/ReactorArgs.md)\<`A`, `M`, `T`\>

Defined in: [types/reactor.ts:180](https://github.com/B3Pay/ic-reactor/blob/2c4a4d6d0734eef45eb58617a4984eddfb64f9d9/packages/core/src/types/reactor.ts#L180)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`args`](ReactorQueryParams.md#args)

---

### queryKey?

> `optional` **queryKey**: readonly `unknown`[]

Defined in: [types/reactor.ts:181](https://github.com/B3Pay/ic-reactor/blob/2c4a4d6d0734eef45eb58617a4984eddfb64f9d9/packages/core/src/types/reactor.ts#L181)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`queryKey`](ReactorQueryParams.md#querykey)

---

### callConfig?

> `optional` **callConfig**: `CallConfig`

Defined in: [types/reactor.ts:193](https://github.com/B3Pay/ic-reactor/blob/2c4a4d6d0734eef45eb58617a4984eddfb64f9d9/packages/core/src/types/reactor.ts#L193)
