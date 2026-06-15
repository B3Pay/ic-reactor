---
title: ClientManager
editUrl: false
next: true
prev: true
---

Defined in: [core/src/client.ts:36](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L36)

ClientManager is a central class for managing the Internet Computer (IC) agent.

It initializes the agent (connecting to local or mainnet) and integrates
with TanStack Query's QueryClient for state management.

## Example

```typescript
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const queryClient = new QueryClient()
const clientManager = new ClientManager({
  queryClient,
  agentOptions: { host: "http://127.0.0.1:4943" },
})

await clientManager.initialize()
```

## Constructors

### Constructor

> **new ClientManager**(`parameters`): `ClientManager`

Defined in: [core/src/client.ts:57](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L57)

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

Defined in: [core/src/client.ts:45](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L45)

The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.

---

### agentState

> **agentState**: [`AgentState`](../interfaces/AgentState.md)

Defined in: [core/src/client.ts:49](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L49)

Current state of the HttpAgent, including initialization status, network, and error information.

## Accessors

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [core/src/client.ts:168](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L168)

The underlying HttpAgent managed by this class.

##### Returns

`HttpAgent`

---

### agentHost

#### Get Signature

> **get** **agentHost**(): `URL` \| `undefined`

Defined in: [core/src/client.ts:175](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L175)

The host URL of the current IC agent.

##### Returns

`URL` \| `undefined`

---

### agentHostName

#### Get Signature

> **get** **agentHostName**(): `string`

Defined in: [core/src/client.ts:182](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L182)

The hostname of the current IC agent.

##### Returns

`string`

---

### isLocal

#### Get Signature

> **get** **isLocal**(): `boolean`

Defined in: [core/src/client.ts:189](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L189)

Returns true if the agent is connecting to a local environment.

##### Returns

`boolean`

---

### network

#### Get Signature

> **get** **network**(): `"local"` \| `"remote"` \| `"ic"`

Defined in: [core/src/client.ts:196](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L196)

Returns the current network type ('ic' or 'local').

##### Returns

`"local"` \| `"remote"` \| `"ic"`

## Methods

### initialize()

> **initialize**(): `Promise`\<`ClientManager`\>

Defined in: [core/src/client.ts:115](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L115)

Orchestrates the complete initialization of the ClientManager.
This method awaits the agent's core initialization (e.g., fetching root keys)
Authentication session restoration is handled by AuthenticationManager.

#### Returns

`Promise`\<`ClientManager`\>

A promise that resolves to the ClientManager instance when core initialization is complete.

---

### initializeAgent()

> **initializeAgent**(): `Promise`\<`void`\>

Defined in: [core/src/client.ts:126](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L126)

Specifically initializes the HttpAgent.
On local networks, this includes fetching the root key for certificate verification.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the agent is fully initialized.

---

### getUserPrincipal()

> **getUserPrincipal**(): `Promise`\<`Principal`\>

Defined in: [core/src/client.ts:204](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L204)

Returns the current user's Principal identity.

#### Returns

`Promise`\<`Principal`\>

---

### registerCanisterId()

> **registerCanisterId**(`canisterId`, `name?`): `void`

Defined in: [core/src/client.ts:212](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L212)

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

Defined in: [core/src/client.ts:232](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L232)

Returns a list of all canister IDs registered with this agent.

#### Returns

`string`[]

---

### getSubnetIdFromCanister()

> **getSubnetIdFromCanister**(`canisterId`): `Promise`\<`Principal`\>

Defined in: [core/src/client.ts:239](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L239)

Get the subnet ID for a canister.

#### Parameters

##### canisterId

`string`

#### Returns

`Promise`\<`Principal`\>

---

### syncTimeWithSubnet()

> **syncTimeWithSubnet**(`subnetId`): `Promise`\<`void`\>

Defined in: [core/src/client.ts:246](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L246)

Sync time with a specific subnet.

#### Parameters

##### subnetId

`Principal`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [core/src/client.ts:255](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L255)

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

Defined in: [core/src/client.ts:269](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L269)

Subscribes to changes in the agent's initialization state.

#### Parameters

##### callback

(`state`) => `void`

Function called with the updated agent state.

#### Returns

An unsubscribe function.

() => `void`

---

### updateAgent()

> **updateAgent**(`identity`): `void`

Defined in: [core/src/client.ts:282](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/client.ts#L282)

Replaces the current agent's identity and invalidates TanStack queries.

#### Parameters

##### identity

`Identity`

The new identity to use.

#### Returns

`void`
