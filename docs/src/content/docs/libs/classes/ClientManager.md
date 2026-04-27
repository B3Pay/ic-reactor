---
title: ClientManager
editUrl: false
next: true
prev: true
---

Defined in: [client.ts:60](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L60)

ClientManager is a central class for managing the Internet Computer (IC) agent and authentication state.

It initializes the agent (connecting to local or mainnet), handles authentication via AuthClient,
and integrates with TanStack Query's QueryClient for state management.

## Example

```typescript
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"

const queryClient = new QueryClient()
const clientManager = new ClientManager({
  queryClient,
  withLocalEnv: true, // Use local replica
})

await clientManager.initialize()
```

## Constructors

### Constructor

> **new ClientManager**(`parameters`): `ClientManager`

Defined in: [client.ts:93](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L93)

Creates a new instance of ClientManager.

#### Parameters

##### parameters

[`ClientManagerParameters`](../interfaces/ClientManagerParameters.md)

Configuration options for the agent and network environment.

#### Returns

`ClientManager`

## Properties

### queryClient

> **queryClient**: `QueryClient`

Defined in: [client.ts:71](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L71)

The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.

---

### agentState

> **agentState**: [`AgentState`](../interfaces/AgentState.md)

Defined in: [client.ts:75](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L75)

Current state of the HttpAgent, including initialization status, network, and error information.

---

### authState

> **authState**: [`AuthState`](../interfaces/AuthState.md)

Defined in: [client.ts:79](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L79)

Current authentication state, including the active identity, authentication progress, and errors.

## Accessors

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [client.ts:519](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L519)

The underlying HttpAgent managed by this class.

##### Returns

`HttpAgent`

---

### authClient

#### Get Signature

> **get** **authClient**(): [`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`

Defined in: [client.ts:526](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L526)

The AuthClient instance used for authentication, if available.

##### Returns

[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`

---

### agentHost

#### Get Signature

> **get** **agentHost**(): `URL` \| `undefined`

Defined in: [client.ts:589](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L589)

The host URL of the current IC agent.

##### Returns

`URL` \| `undefined`

---

### agentHostName

#### Get Signature

> **get** **agentHostName**(): `string`

Defined in: [client.ts:596](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L596)

The hostname of the current IC agent.

##### Returns

`string`

---

### isLocal

#### Get Signature

> **get** **isLocal**(): `boolean`

Defined in: [client.ts:603](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L603)

Returns true if the agent is connecting to a local environment.

##### Returns

`boolean`

---

### network

#### Get Signature

> **get** **network**(): `"local"` \| `"remote"` \| `"ic"`

Defined in: [client.ts:610](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L610)

Returns the current network type ('ic' or 'local').

##### Returns

`"local"` \| `"remote"` \| `"ic"`

## Methods

### initialize()

> **initialize**(): `Promise`\<`ClientManager`\>

Defined in: [client.ts:200](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L200)

Orchestrates the complete initialization of the ClientManager.
This method awaits the agent's core initialization (e.g., fetching root keys)
and triggers the authentication (session restoration) in the background.

#### Returns

`Promise`\<`ClientManager`\>

A promise that resolves to the ClientManager instance when core initialization is complete.

---

### initializeAgent()

> **initializeAgent**(): `Promise`\<`void`\>

Defined in: [client.ts:212](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L212)

Specifically initializes the HttpAgent.
On local networks, this includes fetching the root key for certificate verification.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the agent is fully initialized.

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [client.ts:264](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L264)

Attempts to initialize the authentication client and restore a previous session.

If an `AuthClient` is already initialized (passed in constructor or previously created),
it uses that instance. Otherwise, it dynamically imports the `@icp-sdk/auth` module
and creates a new AuthClient.

If the module is missing and no client is provided, it fails gracefully by marking authentication as unavailable.

#### Returns

`Promise`\<`Identity` \| `undefined`\>

A promise that resolves to the restored Identity, or undefined if auth fails or is unavailable.

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: [client.ts:324](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L324)

Triggers the login flow using the Internet Identity provider.

#### Parameters

##### loginOptions?

[`ClientManagerSignInOptions`](../interfaces/ClientManagerSignInOptions.md)

Options for the login flow, including identity provider and callbacks.

#### Returns

`Promise`\<`void`\>

#### Throws

An error if the authentication module is not installed.

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: [client.ts:396](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L396)

Logs out the user and reverts the agent to an anonymous identity.

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

#### Throws

An error if the authentication module is not installed.

---

### requestIdentityAttributes()

> **requestIdentityAttributes**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: [client.ts:413](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L413)

#### Parameters

##### \_\_namedParameters

[`RequestIdentityAttributesParameters`](../interfaces/RequestIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

---

### requestOpenIdIdentityAttributes()

> **requestOpenIdIdentityAttributes**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: [client.ts:494](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L494)

#### Parameters

##### \_\_namedParameters

[`RequestOpenIdIdentityAttributesParameters`](../interfaces/RequestOpenIdIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

---

### getUserPrincipal()

> **getUserPrincipal**(): `Promise`\<`Principal`\>

Defined in: [client.ts:618](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L618)

Returns the current user's Principal identity.

#### Returns

`Promise`\<`Principal`\>

---

### registerCanisterId()

> **registerCanisterId**(`canisterId`, `name?`): `void`

Defined in: [client.ts:626](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L626)

Registers a canister ID that this agent will interact with.
This is used for informational purposes and network detection.

#### Parameters

##### canisterId

`string`

##### name?

`string`

#### Returns

`void`

---

### connectedCanisterIds()

> **connectedCanisterIds**(): `string`[]

Defined in: [client.ts:646](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L646)

Returns a list of all canister IDs registered with this agent.

#### Returns

`string`[]

---

### getSubnetIdFromCanister()

> **getSubnetIdFromCanister**(`canisterId`): `Promise`\<`Principal`\>

Defined in: [client.ts:653](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L653)

Get the subnet ID for a canister.

#### Parameters

##### canisterId

`string`

#### Returns

`Promise`\<`Principal`\>

---

### syncTimeWithSubnet()

> **syncTimeWithSubnet**(`subnetId`): `Promise`\<`void`\>

Defined in: [client.ts:660](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L660)

Sync time with a specific subnet.

#### Parameters

##### subnetId

`Principal`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [client.ts:680](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L680)

Subscribes to identity changes (e.g., after login/logout).

#### Parameters

##### callback

(`identity`) => `void`

Function called with the new identity.

#### Returns

An unsubscribe function.

() => `void`

---

### subscribeAgentState()

> **subscribeAgentState**(`callback`): () => `void`

Defined in: [client.ts:694](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L694)

Subscribes to changes in the agent's initialization state.

#### Parameters

##### callback

(`state`) => `void`

Function called with the updated agent state.

#### Returns

An unsubscribe function.

() => `void`

---

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: [client.ts:708](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L708)

Subscribes to changes in the authentication state.

#### Parameters

##### callback

(`state`) => `void`

Function called with the updated authentication state.

#### Returns

An unsubscribe function.

() => `void`

---

### updateAgent()

> **updateAgent**(`identity`): `void`

Defined in: [client.ts:721](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/client.ts#L721)

Replaces the current agent's identity and invalidates TanStack queries.

#### Parameters

##### identity

`Identity`

The new identity to use.

#### Returns

`void`
