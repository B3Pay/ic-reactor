---
title: Reactor
editUrl: false
next: true
prev: true
---

Defined in: [reactor.ts:44](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L44)

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

Defined in: [reactor.ts:54](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L54)

#### Parameters

##### config

[`ReactorParameters`](../interfaces/ReactorParameters.md)

#### Returns

`Reactor`\<`A`, `T`\>

## Properties

### \_actor

> `readonly` **\_actor**: `A`

Defined in: [reactor.ts:46](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L46)

Phantom type brand for inference - never assigned at runtime

---

### transform

> `readonly` **transform**: keyof [`TransformArgsRegistry`](../interfaces/TransformArgsRegistry.md)\<`unknown`\> = `"candid"`

Defined in: [reactor.ts:47](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L47)

---

### clientManager

> **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [reactor.ts:48](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L48)

---

### name

> **name**: `string`

Defined in: [reactor.ts:49](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L49)

---

### canisterId

> **canisterId**: `Principal`

Defined in: [reactor.ts:50](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L50)

---

### service

> **service**: `ServiceClass`

Defined in: [reactor.ts:51](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L51)

---

### pollingOptions

> **pollingOptions**: `PollingOptions`

Defined in: [reactor.ts:52](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L52)

## Accessors

### queryClient

#### Get Signature

> **get** **queryClient**(): `QueryClient`

Defined in: [reactor.ts:450](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L450)

Get the query client from clientManager.
This is the recommended way to access the query client for direct queries.

##### Returns

`QueryClient`

---

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [reactor.ts:458](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L458)

Get the agent from clientManager.
This is the recommended way to access the agent for direct calls.

##### Returns

`HttpAgent`

## Methods

### setCanisterId()

> **setCanisterId**(`canisterId`): `void`

Defined in: [reactor.ts:104](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L104)

Set the canister ID for this reactor.
Useful for dynamically switching between canisters of the same type (e.g., multiple ICRC tokens).

#### Parameters

##### canisterId

[`CanisterId`](../type-aliases/CanisterId.md)

The new canister ID (as string or Principal)

#### Returns

`void`

#### Example

```typescript
// Switch to a different ledger canister
ledgerReactor.setCanisterId("ryjl3-tyaaa-aaaaa-aaaba-cai")

// Then use queries/mutations as normal
const { data } = icrc1NameQuery.useQuery()
```

---

### setCanisterName()

> **setCanisterName**(`name`): `void`

Defined in: [reactor.ts:125](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L125)

Set the canister name for this reactor.
Useful for dynamically switching between canisters of the same type (e.g., multiple ICRC tokens).

#### Parameters

##### name

`string`

The new canister name

#### Returns

`void`

#### Example

```typescript
// Switch to a different ledger canister
ledgerReactor.setCanisterName("icrc1")

// Then use queries/mutations as normal
const { data } = icrc1NameQuery.useQuery()
```

---

### getServiceInterface()

> **getServiceInterface**(): `ServiceClass`

Defined in: [reactor.ts:138](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L138)

Get the service interface (IDL.ServiceClass) for this reactor.
Useful for introspection and codec generation.

#### Returns

`ServiceClass`

The service interface

---

### isQueryMethod()

> **isQueryMethod**\<`M`\>(`methodName`): `boolean`

Defined in: [reactor.ts:157](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L157)

Check if a method is a query method (query or composite_query).

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

#### Returns

`boolean`

---

### generateQueryKey()

> **generateQueryKey**\<`M`\>(`params`): readonly `unknown`[]

Defined in: [reactor.ts:199](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L199)

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

Defined in: [reactor.ts:219](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L219)

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

Defined in: [reactor.ts:246](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L246)

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

Defined in: [reactor.ts:286](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L286)

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

Defined in: [reactor.ts:359](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L359)

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

Defined in: [reactor.ts:369](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L369)

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

Defined in: [reactor.ts:430](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L430)

Get the subnet ID for this canister.

#### Returns

`Promise`\<`Principal`\>

---

### subnetState()

> **subnetState**(`options`): `Promise`\<`ReadStateResponse`\>

Defined in: [reactor.ts:437](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/reactor.ts#L437)

Get the subnet state for this canister.

#### Parameters

##### options

`ReadStateOptions`

#### Returns

`Promise`\<`ReadStateResponse`\>
