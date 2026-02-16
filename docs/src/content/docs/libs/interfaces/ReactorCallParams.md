---
title: ReactorCallParams
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:182](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L182)

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

Defined in: [types/reactor.ts:173](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L173)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`functionName`](ReactorQueryParams.md#functionname)

---

### args?

> `optional` **args**: [`ReactorArgs`](../type-aliases/ReactorArgs.md)\<`A`, `M`, `T`\>

Defined in: [types/reactor.ts:174](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L174)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`args`](ReactorQueryParams.md#args)

---

### queryKey?

> `optional` **queryKey**: readonly `unknown`[]

Defined in: [types/reactor.ts:175](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L175)

#### Inherited from

[`ReactorQueryParams`](ReactorQueryParams.md).[`queryKey`](ReactorQueryParams.md#querykey)

---

### callConfig?

> `optional` **callConfig**: `CallConfig`

Defined in: [types/reactor.ts:187](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L187)
