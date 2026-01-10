---
title: ReactorCallParams
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:181](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L181)

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

Defined in: [types/reactor.ts:172](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L172)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`functionName`](ReactorQueryParams.md#functionname)

---

### args?

> `optional` **args**: [`ReactorArgs`](../type-aliases/ReactorArgs.md)\<`A`, `M`, `T`\>

Defined in: [types/reactor.ts:173](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L173)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`args`](ReactorQueryParams.md#args)

---

### queryKey?

> `optional` **queryKey**: readonly `unknown`[]

Defined in: [types/reactor.ts:174](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L174)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`queryKey`](ReactorQueryParams.md#querykey)

---

### callConfig?

> `optional` **callConfig**: `CallConfig`

Defined in: [types/reactor.ts:186](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L186)
