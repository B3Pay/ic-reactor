---
title: ClientManager
editUrl: false
next: true
prev: true
---

Defined in: [client.ts:40](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L40)

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

Defined in: [client.ts:71](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L71)

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

Defined in: [client.ts:51](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L51)

The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.

---

### agentState

> **agentState**: [`AgentState`](../interfaces/AgentState.md)

Defined in: [client.ts:55](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L55)

Current state of the HttpAgent, including initialization status, network, and error information.

---

### authState

> **authState**: [`AuthState`](../interfaces/AuthState.md)

Defined in: [client.ts:59](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L59)

Current authentication state, including the active identity, authentication progress, and errors.

## Accessors

### agent

#### Get Signature

> **get** **agent**(): `HttpAgent`

Defined in: [client.ts:385](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L385)

The underlying HttpAgent managed by this class.

##### Returns

`HttpAgent`

---

### agentHost

#### Get Signature

> **get** **agentHost**(): `URL` \| `undefined`

Defined in: [client.ts:392](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L392)

The host URL of the current IC agent.

##### Returns

`URL` \| `undefined`

---

### agentHostName

#### Get Signature

> **get** **agentHostName**(): `string`

Defined in: [client.ts:399](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L399)

The hostname of the current IC agent.

##### Returns

`string`

---

### isLocal

#### Get Signature

> **get** **isLocal**(): `boolean`

Defined in: [client.ts:406](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L406)

Returns true if the agent is connecting to a local environment.

##### Returns

`boolean`

---

### network

#### Get Signature

> **get** **network**(): `"local"` \| `"remote"` \| `"ic"`

Defined in: [client.ts:413](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L413)

Returns the current network type ('ic' or 'local').

##### Returns

`"local"` \| `"remote"` \| `"ic"`

## Methods

### initialize()

> **initialize**(): `Promise`\<`ClientManager`\>

Defined in: [client.ts:172](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L172)

Orchestrates the complete initialization of the ClientManager.
This method awaits the agent's core initialization (e.g., fetching root keys)
and triggers the authentication (session restoration) in the background.

#### Returns

`Promise`\<`ClientManager`\>

A promise that resolves to the ClientManager instance when core initialization is complete.

---

### initializeAgent()

> **initializeAgent**(): `Promise`\<`void`\>

Defined in: [client.ts:184](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L184)

Specifically initializes the HttpAgent.
On local networks, this includes fetching the root key for certificate verification.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the agent is fully initialized.

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [client.ts:236](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L236)

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

Defined in: [client.ts:303](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L303)

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

Defined in: [client.ts:363](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L363)

Logs out the user and reverts the agent to an anonymous identity.

#### Returns

`Promise`\<`void`\>

#### Throws

An error if the authentication module is not installed.

---

### getUserPrincipal()

> **getUserPrincipal**(): `Promise`\<`Principal`\>

Defined in: [client.ts:421](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L421)

Returns the current user's Principal identity.

#### Returns

`Promise`\<`Principal`\>

---

### registerCanisterId()

> **registerCanisterId**(`canisterId`, `name?`): `void`

Defined in: [client.ts:429](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L429)

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

Defined in: [client.ts:449](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L449)

Returns a list of all canister IDs registered with this agent.

#### Returns

`string`[]

---

### getSubnetIdFromCanister()

> **getSubnetIdFromCanister**(`canisterId`): `Promise`\<`Principal`\>

Defined in: [client.ts:456](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L456)

Get the subnet ID for a canister.

#### Parameters

##### canisterId

`string`

#### Returns

`Promise`\<`Principal`\>

---

### syncTimeWithSubnet()

> **syncTimeWithSubnet**(`subnetId`): `Promise`\<`void`\>

Defined in: [client.ts:463](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L463)

Sync time with a specific subnet.

#### Parameters

##### subnetId

`Principal`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [client.ts:483](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L483)

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

Defined in: [client.ts:497](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L497)

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

Defined in: [client.ts:511](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L511)

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

Defined in: [client.ts:524](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/client.ts#L524)

Replaces the current agent's identity and invalidates TanStack queries.

#### Parameters

##### identity

`Identity`

The new identity to use.

#### Returns

`void`
