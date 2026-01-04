---
title: ClientManager
editUrl: false
next: true
prev: true
---

Defined in: [client.ts:39](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L39)

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

Defined in: [client.ts:68](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L68)

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

Defined in: [client.ts:50](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L50)

The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.

---

### agentState

> **agentState**: [`AgentState`](../interfaces/AgentState.md)

Defined in: [client.ts:54](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L54)

Current state of the HttpAgent, including initialization status, network, and error information.

---

### authState

> **authState**: [`AuthState`](../interfaces/AuthState.md)

Defined in: [client.ts:58](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L58)

Current authentication state, including the active identity, authentication progress, and errors.

## Accessors

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [client.ts:345](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L345)

The underlying HttpAgent managed by this class.

##### Returns

`HttpAgent`

---

### agentHost

#### Get Signature

> **get** **agentHost**(): `URL` \| `undefined`

Defined in: [client.ts:352](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L352)

The host URL of the current IC agent.

##### Returns

`URL` \| `undefined`

---

### agentHostName

#### Get Signature

> **get** **agentHostName**(): `string`

Defined in: [client.ts:359](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L359)

The hostname of the current IC agent.

##### Returns

`string`

---

### isLocal

#### Get Signature

> **get** **isLocal**(): `boolean`

Defined in: [client.ts:366](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L366)

Returns true if the agent is connecting to a local environment.

##### Returns

`boolean`

---

### network

#### Get Signature

> **get** **network**(): `"local"` \| `"remote"` \| `"ic"`

Defined in: [client.ts:373](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L373)

Returns the current network type ('ic' or 'local').

##### Returns

`"local"` \| `"remote"` \| `"ic"`

## Methods

### initialize()

> **initialize**(): `Promise`\<`ClientManager`\>

Defined in: [client.ts:132](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L132)

Orchestrates the complete initialization of the ClientManager.
This method awaits the agent's core initialization (e.g., fetching root keys)
and triggers the authentication (session restoration) in the background.

#### Returns

`Promise`\<`ClientManager`\>

A promise that resolves to the ClientManager instance when core initialization is complete.

---

### initializeAgent()

> **initializeAgent**(): `Promise`\<`void`\>

Defined in: [client.ts:144](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L144)

Specifically initializes the HttpAgent.
On local networks, this includes fetching the root key for certificate verification.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the agent is fully initialized.

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [client.ts:196](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L196)

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

Defined in: [client.ts:263](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L263)

Triggers the login flow using the Internet Identity provider.

#### Parameters

##### loginOptions?

`AuthClientLoginOptions`

Options for the login flow, including identity provider and callbacks.

#### Returns

`Promise`\<`void`\>

#### Throws

An error if the authentication module is not installed.

---

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [client.ts:323](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L323)

Logs out the user and reverts the agent to an anonymous identity.

#### Returns

`Promise`\<`void`\>

#### Throws

An error if the authentication module is not installed.

---

### getUserPrincipal()

> **getUserPrincipal**(): `Promise`\<`Principal`\>

Defined in: [client.ts:381](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L381)

Returns the current user's Principal identity.

#### Returns

`Promise`\<`Principal`\>

---

### registerCanisterId()

> **registerCanisterId**(`canisterId`, `name?`): `void`

Defined in: [client.ts:389](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L389)

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

Defined in: [client.ts:409](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L409)

Returns a list of all canister IDs registered with this agent.

#### Returns

`string`[]

---

### getSubnetIdFromCanister()

> **getSubnetIdFromCanister**(`canisterId`): `Promise`\<`Principal`\>

Defined in: [client.ts:416](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L416)

Get the subnet ID for a canister.

#### Parameters

##### canisterId

`string`

#### Returns

`Promise`\<`Principal`\>

---

### syncTimeWithSubnet()

> **syncTimeWithSubnet**(`subnetId`): `Promise`\<`void`\>

Defined in: [client.ts:423](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L423)

Sync time with a specific subnet.

#### Parameters

##### subnetId

`Principal`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [client.ts:440](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L440)

Subscribes to identity changes (e.g., after login/logout).

#### Parameters

##### callback

(`identity`) => `void`

Function called with the new identity.

#### Returns

An unsubscribe function.

> (): `void`

##### Returns

`void`

---

### subscribeAgentState()

> **subscribeAgentState**(`callback`): () => `void`

Defined in: [client.ts:454](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L454)

Subscribes to changes in the agent's initialization state.

#### Parameters

##### callback

(`state`) => `void`

Function called with the updated agent state.

#### Returns

An unsubscribe function.

> (): `void`

##### Returns

`void`

---

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: [client.ts:468](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L468)

Subscribes to changes in the authentication state.

#### Parameters

##### callback

(`state`) => `void`

Function called with the updated authentication state.

#### Returns

An unsubscribe function.

> (): `void`

##### Returns

`void`

---

### updateAgent()

> **updateAgent**(`identity`): `void`

Defined in: [client.ts:481](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/client.ts#L481)

Replaces the current agent's identity and invalidates TanStack queries.

#### Parameters

##### identity

`Identity`

The new identity to use.

#### Returns

`void`
