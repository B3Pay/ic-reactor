---
editUrl: false
next: true
prev: true
---

Defined in: [core/src/client.ts:35](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L35)

ClientManager is a central class for managing the Internet Computer (IC) agent.

It initializes the agent (connecting to local or mainnet) and integrates
with TanStack Query's QueryClient for state management.

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

Defined in: [core/src/client.ts:56](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L56)

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

Defined in: [core/src/client.ts:44](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L44)

The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.

---

### agentState

> **agentState**: [`AgentState`](../interfaces/AgentState.md)

Defined in: [core/src/client.ts:48](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L48)

Current state of the HttpAgent, including initialization status, network, and error information.

## Accessors

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [core/src/client.ts:193](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L193)

The underlying HttpAgent managed by this class.

##### Returns

`HttpAgent`

---

### agentHost

#### Get Signature

> **get** **agentHost**(): `URL` \| `undefined`

Defined in: [core/src/client.ts:200](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L200)

The host URL of the current IC agent.

##### Returns

`URL` \| `undefined`

---

### agentHostName

#### Get Signature

> **get** **agentHostName**(): `string`

Defined in: [core/src/client.ts:207](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L207)

The hostname of the current IC agent.

##### Returns

`string`

---

### isLocal

#### Get Signature

> **get** **isLocal**(): `boolean`

Defined in: [core/src/client.ts:214](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L214)

Returns true if the agent is connecting to a local environment.

##### Returns

`boolean`

---

### network

#### Get Signature

> **get** **network**(): `"local"` \| `"remote"` \| `"ic"`

Defined in: [core/src/client.ts:221](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L221)

Returns the current network type ('ic' or 'local').

##### Returns

`"local"` \| `"remote"` \| `"ic"`

## Methods

### initialize()

> **initialize**(): `Promise`\<`ClientManager`\>

Defined in: [core/src/client.ts:140](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L140)

Orchestrates the complete initialization of the ClientManager.
This method awaits the agent's core initialization (e.g., fetching root keys)
Authentication session restoration is handled by AuthenticationManager.

#### Returns

`Promise`\<`ClientManager`\>

A promise that resolves to the ClientManager instance when core initialization is complete.

---

### initializeAgent()

> **initializeAgent**(): `Promise`\<`void`\>

Defined in: [core/src/client.ts:151](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L151)

Specifically initializes the HttpAgent.
On local networks, this includes fetching the root key for certificate verification.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the agent is fully initialized.

---

### getUserPrincipal()

> **getUserPrincipal**(): `Promise`\<`Principal`\>

Defined in: [core/src/client.ts:229](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L229)

Returns the current user's Principal identity.

#### Returns

`Promise`\<`Principal`\>

---

### registerCanisterId()

> **registerCanisterId**(`canisterId`, `name?`): `void`

Defined in: [core/src/client.ts:237](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L237)

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

Defined in: [core/src/client.ts:257](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L257)

Returns a list of all canister IDs registered with this agent.

#### Returns

`string`[]

---

### getSubnetIdFromCanister()

> **getSubnetIdFromCanister**(`canisterId`): `Promise`\<`Principal`\>

Defined in: [core/src/client.ts:264](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L264)

Get the subnet ID for a canister.

#### Parameters

##### canisterId

`string`

#### Returns

`Promise`\<`Principal`\>

---

### syncTimeWithSubnet()

> **syncTimeWithSubnet**(`subnetId`): `Promise`\<`void`\>

Defined in: [core/src/client.ts:271](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L271)

Sync time with a specific subnet.

#### Parameters

##### subnetId

`Principal`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [core/src/client.ts:280](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L280)

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

Defined in: [core/src/client.ts:294](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L294)

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

Defined in: [core/src/client.ts:307](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/client.ts#L307)

Replaces the current agent's identity and invalidates TanStack queries.

#### Parameters

##### identity

`Identity`

The new identity to use.

#### Returns

`void`
