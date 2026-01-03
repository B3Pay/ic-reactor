---
title: ReactorQueryParams
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:174](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/reactor.ts#L174)

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

Defined in: [types/reactor.ts:179](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/reactor.ts#L179)

---

### args?

> `optional` **args**: [`ReactorArgs`](../type-aliases/ReactorArgs.md)\<`A`, `M`, `T`\>

Defined in: [types/reactor.ts:180](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/reactor.ts#L180)

---

### queryKey?

> `optional` **queryKey**: readonly `unknown`[]

Defined in: [types/reactor.ts:181](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/reactor.ts#L181)
