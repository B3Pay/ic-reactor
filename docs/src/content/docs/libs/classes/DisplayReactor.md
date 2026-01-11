---
title: DisplayReactor
editUrl: false
next: true
prev: true
---

Defined in: [display-reactor.ts:76](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L76)

DisplayReactor provides automatic type transformations between Candid and
display-friendly types, plus optional argument validation.

### Type Transformations

- `bigint` → `string` (for JSON/UI display)
- `Principal` → `string` (text representation)
- `[T] | []` → `T | null` (optional unwrapping)
- Small blobs → hex strings

### Validation (Optional)

Register validators to check arguments before canister calls.
Validators receive **display types** (strings), making them perfect for
form validation.

## Example

```typescript
import { DisplayReactor } from "@ic-reactor/core"

const reactor = new DisplayReactor<_SERVICE>({
  clientManager,
  canisterId: "...",
  idlFactory,
})

// Optional: Add validation
reactor.registerValidator("transfer", ([input]) => {
  if (!input.to) {
    return {
      success: false,
      issues: [{ path: ["to"], message: "Recipient is required" }],
    }
  }
  return { success: true }
})

// Call with display types
await reactor.callMethod({
  functionName: "transfer",
  args: [{ to: "aaaaa-aa", amount: "100" }], // strings!
})
```

## Extends

- [`Reactor`](Reactor.md)\<`A`, `"display"`\>

## Type Parameters

### A

`A` = [`BaseActor`](../type-aliases/BaseActor.md)

The actor service type

## Constructors

### Constructor

> **new DisplayReactor**\<`A`\>(`config`): `DisplayReactor`\<`A`\>

Defined in: [display-reactor.ts:84](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L84)

#### Parameters

##### config

[`DisplayReactorParameters`](../type-aliases/DisplayReactorParameters.md)\<`A`\>

#### Returns

`DisplayReactor`\<`A`\>

#### Overrides

[`Reactor`](Reactor.md).[`constructor`](Reactor.md#constructor)

## Properties

### transform

> `readonly` **transform**: `"display"` = `"display"`

Defined in: [display-reactor.ts:77](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L77)

#### Overrides

[`Reactor`](Reactor.md).[`transform`](Reactor.md#transform)

---

### \_actor

> `readonly` **\_actor**: `A`

Defined in: [reactor.ts:46](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L46)

Phantom type brand for inference - never assigned at runtime

#### Inherited from

[`Reactor`](Reactor.md).[`_actor`](Reactor.md#_actor)

---

### clientManager

> **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [reactor.ts:48](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L48)

#### Inherited from

[`Reactor`](Reactor.md).[`clientManager`](Reactor.md#clientmanager)

---

### name

> **name**: `string`

Defined in: [reactor.ts:49](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L49)

#### Inherited from

[`Reactor`](Reactor.md).[`name`](Reactor.md#name)

---

### canisterId

> **canisterId**: `Principal`

Defined in: [reactor.ts:50](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L50)

#### Inherited from

[`Reactor`](Reactor.md).[`canisterId`](Reactor.md#canisterid)

---

### service

> **service**: `ServiceClass`

Defined in: [reactor.ts:51](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L51)

#### Inherited from

[`Reactor`](Reactor.md).[`service`](Reactor.md#service)

---

### pollingOptions

> **pollingOptions**: `PollingOptions`

Defined in: [reactor.ts:52](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L52)

#### Inherited from

[`Reactor`](Reactor.md).[`pollingOptions`](Reactor.md#pollingoptions)

## Accessors

### queryClient

#### Get Signature

> **get** **queryClient**(): `QueryClient`

Defined in: [reactor.ts:432](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L432)

Get the query client from clientManager.
This is the recommended way to access the query client for direct queries.

##### Returns

`QueryClient`

#### Inherited from

[`Reactor`](Reactor.md).[`queryClient`](Reactor.md#queryclient)

---

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [reactor.ts:440](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L440)

Get the agent from clientManager.
This is the recommended way to access the agent for direct calls.

##### Returns

`HttpAgent`

#### Inherited from

[`Reactor`](Reactor.md).[`agent`](Reactor.md#agent)

## Methods

### getCodec()

> **getCodec**\<`M`\>(`methodName`): [`ActorMethodCodecs`](../interfaces/ActorMethodCodecs.md)\<`A`, `M`\> \| `null`

Defined in: [display-reactor.ts:133](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L133)

Get a codec for a specific method.
Returns the args and result codecs for bidirectional transformation.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

The name of the method

#### Returns

[`ActorMethodCodecs`](../interfaces/ActorMethodCodecs.md)\<`A`, `M`\> \| `null`

Object with args and result codecs, or null if not found

---

### registerValidator()

> **registerValidator**\<`M`\>(`methodName`, `validator`): `void`

Defined in: [display-reactor.ts:169](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L169)

Register a validator for a specific method.
Validators receive display types (strings for Principal/bigint).

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

The name of the method to validate

##### validator

[`DisplayValidator`](../type-aliases/DisplayValidator.md)\<`A`, `M`\>

The validator function receiving display types

#### Returns

`void`

#### Example

```typescript
// input.to is string, input.amount is string
reactor.registerValidator("transfer", ([input]) => {
  if (!/^\d+$/.test(input.amount)) {
    return {
      success: false,
      issues: [{ path: ["amount"], message: "Must be a valid number" }],
    }
  }
  return { success: true }
})
```

---

### unregisterValidator()

> **unregisterValidator**\<`M`\>(`methodName`): `void`

Defined in: [display-reactor.ts:179](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L179)

Unregister a validator for a specific method.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

#### Returns

`void`

---

### hasValidator()

> **hasValidator**\<`M`\>(`methodName`): `boolean`

Defined in: [display-reactor.ts:186](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L186)

Check if a method has a registered validator.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

#### Returns

`boolean`

---

### validate()

> **validate**\<`M`\>(`methodName`, `args`): `Promise`\<[`ValidationResult`](../type-aliases/ValidationResult.md)\>

Defined in: [display-reactor.ts:214](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L214)

Validate arguments without calling the canister.
Arguments are in display format (strings for Principal/bigint).
Useful for form validation before submission.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

The name of the method

##### args

`AsDisplayArgs`\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>

The display-type arguments to validate

#### Returns

`Promise`\<[`ValidationResult`](../type-aliases/ValidationResult.md)\>

ValidationResult indicating success or failure

#### Example

```typescript
// Validate form data before submission
const result = await reactor.validate("transfer", [
  {
    to: formData.recipient, // string
    amount: formData.amount, // string
  },
])

if (!result.success) {
  result.issues.forEach((issue) => {
    form.setError(issue.path[0], issue.message)
  })
}
```

---

### callMethodWithValidation()

> **callMethodWithValidation**\<`M`\>(`params`): `Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [display-reactor.ts:250](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display-reactor.ts#L250)

Call a method with async validation support.
Use this instead of callMethod() when you have async validators.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

###### functionName

`M`

###### args?

`AsDisplayArgs`\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>

###### callConfig?

`CallConfig`

#### Returns

`Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

#### Example

```typescript
// Async validator (e.g., check if address is blocked)
reactor.registerValidator("transfer", async ([input]) => {
  const isBlocked = await checkBlocklist(input.to)
  if (isBlocked) {
    return {
      success: false,
      issues: [{ path: ["to"], message: "Address is blocked" }],
    }
  }
  return { success: true }
})

await reactor.callMethodWithValidation({
  functionName: "transfer",
  args: [{ to: "...", amount: "100" }],
})
```

---

### setCanisterId()

> **setCanisterId**(`canisterId`): `void`

Defined in: [reactor.ts:104](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L104)

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

#### Inherited from

[`Reactor`](Reactor.md).[`setCanisterId`](Reactor.md#setcanisterid)

---

### getServiceInterface()

> **getServiceInterface**(): `ServiceClass`

Defined in: [reactor.ts:119](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L119)

Get the service interface (IDL.ServiceClass) for this reactor.
Useful for introspection and codec generation.

#### Returns

`ServiceClass`

The service interface

#### Inherited from

[`Reactor`](Reactor.md).[`getServiceInterface`](Reactor.md#getserviceinterface)

---

### isQueryMethod()

> **isQueryMethod**\<`M`\>(`methodName`): `boolean`

Defined in: [reactor.ts:138](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L138)

Check if a method is a query method (query or composite_query).

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### methodName

`M`

#### Returns

`boolean`

#### Inherited from

[`Reactor`](Reactor.md).[`isQueryMethod`](Reactor.md#isquerymethod)

---

### generateQueryKey()

> **generateQueryKey**\<`M`\>(`params`): readonly `unknown`[]

Defined in: [reactor.ts:180](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L180)

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `"display"`\>

#### Returns

readonly `unknown`[]

#### Inherited from

[`Reactor`](Reactor.md).[`generateQueryKey`](Reactor.md#generatequerykey)

---

### getQueryOptions()

> **getQueryOptions**\<`M`\>(`params`): `FetchQueryOptions`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [reactor.ts:200](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L200)

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `"display"`\>

#### Returns

`FetchQueryOptions`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

#### Inherited from

[`Reactor`](Reactor.md).[`getQueryOptions`](Reactor.md#getqueryoptions)

---

### invalidateQueries()

> **invalidateQueries**\<`M`\>(`params?`): `void`

Defined in: [reactor.ts:247](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L247)

Invalidate cached queries for this canister.
This will mark matching queries as stale and trigger a refetch for any active queries.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params?

`Partial`\<[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `"display"`\>\>

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

#### Inherited from

[`Reactor`](Reactor.md).[`invalidateQueries`](Reactor.md#invalidatequeries)

---

### callMethod()

> **callMethod**\<`M`\>(`params`): `Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [reactor.ts:287](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L287)

Call a canister method directly using agent.call() or agent.query().
This is the recommended approach for interacting with canisters.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

`Omit`\<[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `T`\>, `"queryKey"`\>

#### Returns

`Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

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

#### Inherited from

[`Reactor`](Reactor.md).[`callMethod`](Reactor.md#callmethod)

---

### fetchQuery()

> **fetchQuery**\<`M`\>(`params`): `Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [reactor.ts:341](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L341)

Fetch data from the canister and cache it using React Query.
This method ensures the data is in the cache and returns it.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorCallParams`](../interfaces/ReactorCallParams.md)\<`A`, `M`, `"display"`\>

#### Returns

`Promise`\<[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\>

#### Inherited from

[`Reactor`](Reactor.md).[`fetchQuery`](Reactor.md#fetchquery)

---

### getQueryData()

> **getQueryData**\<`M`\>(`params`): [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\> \| `undefined`

Defined in: [reactor.ts:351](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L351)

Get the current data from the cache without fetching.

#### Type Parameters

##### M

`M` _extends_ `string`

#### Parameters

##### params

[`ReactorQueryParams`](../interfaces/ReactorQueryParams.md)\<`A`, `M`, `"display"`\>

#### Returns

[`DisplayOf`](../type-aliases/DisplayOf.md)\<[`OkResult`](../type-aliases/OkResult.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\> \| `undefined`

#### Inherited from

[`Reactor`](Reactor.md).[`getQueryData`](Reactor.md#getquerydata)

---

### subnetId()

> **subnetId**(): `Promise`\<`Principal`\>

Defined in: [reactor.ts:412](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L412)

Get the subnet ID for this canister.

#### Returns

`Promise`\<`Principal`\>

#### Inherited from

[`Reactor`](Reactor.md).[`subnetId`](Reactor.md#subnetid)

---

### subnetState()

> **subnetState**(`options`): `Promise`\<`ReadStateResponse`\>

Defined in: [reactor.ts:419](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/reactor.ts#L419)

Get the subnet state for this canister.

#### Parameters

##### options

`ReadStateOptions`

#### Returns

`Promise`\<`ReadStateResponse`\>

#### Inherited from

[`Reactor`](Reactor.md).[`subnetState`](Reactor.md#subnetstate)
