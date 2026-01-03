---
title: Reactor
editUrl: false
next: true
prev: true
---

Defined in: [reactor.ts:42](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L42)

Reactor class for interacting with IC canisters.

This class provides core functionality for:

- Direct agent calls using agent.call() and agent.query()
- Query caching with TanStack Query integration
- Method calls with result unwrapping

## Extended by

- [`DisplayReactor`](DisplayReactor.md)

## Type Parameters

### A

`A` = [`BaseActor`](../type-aliases/BaseActor.md)

The actor service type

### T

`T` _extends_ [`TransformKey`](../type-aliases/TransformKey.md) = `"candid"`

The type transformation to apply (default: candid = raw Candid types)

## Constructors

### Constructor

> **new Reactor**\<`A`, `T`\>(`config`): `Reactor`\<`A`, `T`\>

Defined in: [reactor.ts:52](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L52)

#### Parameters

##### config

[`ReactorParameters`](../type-aliases/ReactorParameters.md)\<`A`\>

#### Returns

`Reactor`\<`A`, `T`\>

## Properties

### \_actor

> `readonly` **\_actor**: `A`

Defined in: [reactor.ts:44](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L44)

Phantom type brand for inference - never assigned at runtime

---

### transform

> `readonly` **transform**: `T`

Defined in: [reactor.ts:45](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L45)

---

### clientManager

> **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [reactor.ts:46](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L46)

---

### name

> **name**: `string`

Defined in: [reactor.ts:47](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L47)

---

### canisterId

> **canisterId**: `Principal`

Defined in: [reactor.ts:48](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L48)

---

### service

> **service**: `ServiceClass`

Defined in: [reactor.ts:49](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L49)

---

### pollingOptions

> **pollingOptions**: `PollingOptions`

Defined in: [reactor.ts:50](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L50)

## Accessors

### queryClient

#### Get Signature

> **get** **queryClient**(): `QueryClient`

Defined in: [reactor.ts:399](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L399)

Get the query client from clientManager.
This is the recommended way to access the query client for direct queries.

##### Returns

`QueryClient`

---

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [reactor.ts:407](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L407)

Get the agent from clientManager.
This is the recommended way to access the agent for direct calls.

##### Returns

`HttpAgent`

## Methods

### getServiceInterface()

> **getServiceInterface**(): `ServiceClass`

Defined in: [reactor.ts:86](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L86)

Get the service interface (IDL.ServiceClass) for this reactor.
Useful for introspection and codec generation.

#### Returns

`ServiceClass`

The service interface

---

### generateQueryKey()

> **generateQueryKey**\<`M`\>(`params`): readonly `unknown`[]

Defined in: [reactor.ts:147](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L147)

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `T`\>

#### Returns

readonly `unknown`[]

---

### getQueryOptions()

> **getQueryOptions**\<`M`\>(`params`): `FetchQueryOptions`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

Defined in: [reactor.ts:167](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L167)

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `T`\>

#### Returns

`FetchQueryOptions`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

---

### invalidateQueries()

> **invalidateQueries**\<`M`\>(`params?`): `void`

Defined in: [reactor.ts:214](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L214)

Invalidate cached queries for this canister.
This will mark matching queries as stale and trigger a refetch for any active queries.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params?

`Partial`\<[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `T`\>\>

Optional parameters to filter the invalidation

#### Returns

`void`

#### Example

```typescript
// Invalidate all queries for this canister
reactor.invalidateQueries()

// Invalidate only 'getUser' queries
reactor.invalidateQueries({ functionName: "getUser" })

// Invalidate 'getUser' query for specific user
reactor.invalidateQueries({ functionName: "getUser", args: ["user-1"] })
```

---

### callMethod()

> **callMethod**\<`M`\>(`params`): `Promise`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

Defined in: [reactor.ts:254](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L254)

Call a canister method directly using agent.call() or agent.query().
This is the recommended approach for interacting with canisters.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

`Omit`\<[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `T`\>, `"queryKey"`\>

#### Returns

`Promise`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

#### Example

```typescript
// Query method
const result = await reactor.callMethod({
  functionName: "greet",
  args: ["world"],
})

// Update method with options
const result = await reactor.callMethod({
  functionName: "transfer",
  args: [{ to: principal, amount: 100n }],
  callConfig: { effectiveCanisterId: principal },
})
```

---

### fetchQuery()

> **fetchQuery**\<`M`\>(`params`): `Promise`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

Defined in: [reactor.ts:308](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L308)

Fetch data from the canister and cache it using React Query.
This method ensures the data is in the cache and returns it.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `T`\>

#### Returns

`Promise`\<[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\>\>

---

### getQueryData()

> **getQueryData**\<`M`\>(`params`): [`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\> \| `undefined`

Defined in: [reactor.ts:318](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L318)

Get the current data from the cache without fetching.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `T`\>

#### Returns

[`ReactorReturnOk`](../type-aliases/ReactorReturnOk.md)\<`A`, `M`, `T`\> \| `undefined`

---

### subnetId()

> **subnetId**(): `Promise`\<`Principal`\>

Defined in: [reactor.ts:379](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L379)

Get the subnet ID for this canister.

#### Returns

`Promise`\<`Principal`\>

---

### subnetState()

> **subnetState**(`options`): `Promise`\<`ReadStateResponse`\>

Defined in: [reactor.ts:386](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/reactor.ts#L386)

Get the subnet state for this canister.

#### Parameters

##### options

`ReadStateOptions`

#### Returns

`Promise`\<`ReadStateResponse`\>
