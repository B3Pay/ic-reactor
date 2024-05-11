The `@ic-reactor/core` package provides a streamlined way to interact with the Internet Computer (IC). It simplifies agent and actor management, ensuring type-safe communication with canisters. This package offers utilities for creating and managing IC agents, enabling seamless interaction through a friendly API.

## Installation

To get started with `@ic-reactor/core`, you can install the package using npm or Yarn:

**Using npm:**

```bash
npm install @ic-reactor/core
```

**Using Yarn:**

```bash
yarn add @ic-reactor/core
```

or you can use the UMD version:

```html
<script src="https://github.com/B3Pay/ic-reactor/releases/download/v1.7.3/ic-reactor-core.min.js"></script>
```

### Using `createReactorCore`

For ease of use, the `createReactorCore` factory function automatically sets up a new Reactor instance, managing the agent and its state internally, and providing a simple API for authenticating, querying, and updating actors.

**Example:**

```typescript
import { createReactorCore } from "@ic-reactor/core"
import { candid, canisterId, idlFactory } from "./declarations/candid"

type Candid = typeof candid

const { queryCall, updateCall, getPrincipal, login } =
  createReactorCore<Candid>({
    canisterId,
    idlFactory,
    withProcessEnv: true, // will use process.env.DFX_NETWORK
  })
```

You can find All available methods are returned from the `createReactorCore` function [here](https://b3pay.github.io/ic-reactor/interfaces/core.types.CreateReactorCoreReturnType.html).

```typescript
// later in your code
await login({
  onSuccess: () => {
    console.log("Logged in successfully")
  },
  onError: (error) => {
    console.error("Failed to login:", error)
  },
})

// queryCall, will automatically call and return a promise with the result
const { dataPromise, call } = queryCall({
  functionName: "icrc1_balance_of",
  args: [{ owner: getPrincipal(), subaccount: [] }],
})

console.log(await dataPromise)

// updateCall
const { call, subscribe } = updateCall({
  functionName: "icrc1_transfer",
  args: [
    {
      to: { owner: getPrincipal(), subaccount: [] },
      amount: BigInt(10000000000),
      fee: [],
      memo: [],
      created_at_time: [],
      from_subaccount: [],
    },
  ],
})
// subscribe to the update call
subscribe(({ loading, error, data }) => {
  console.log({ loading, error, data })
})

const result = await call()
console.log(result)
```

### Managing Multiple Actors

When interacting with multiple canisters using `@ic-reactor/core`, you need one agent manager for each canister. This way, you can create separate reactor for each canister. This enables modular interaction with different services on the Internet Computer,
and allows you to manage the state of each actor independently.
Here's how to adjust the example to handle methods that require multiple arguments:

Fist you need to create a agent manager:

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/core"

export const agentManager = createAgentManager() // Connects to IC network by default
```

Then you can create a Actor for each canister:

```typescript
// Assuming you've already set up `candidA`, `candidB`, and `agentManager`
import { createActorManager } from "@ic-reactor/core"
import * as candidA from "./declarations/candidA"
import * as candidB from "./declarations/candidB"
import { agentManager } from "./agent"

type CandidA = typeof candidA.candidA
type CandidB = typeof candidB.candidB

const actorA = createActorManager<CandidA>({
  agentManager,
  canisterId: candidA.canisterId,
  idlFactory: candidA.idlFactory,
})

const actorB = createActorManager<CandidB>({
  agentManager,
  canisterId: candidB.canisterId,
  idlFactory: candidB.idlFactory,
})
```

You can now use the `actorA` and `actorB` instances to interact with their respective canisters:

```typescript
const { dataPromise: version } = actorA.queryCall({
  functionName: "version",
})
console.log("Response from CanisterA method:", await version)

const { dataPromise: balance } = actorB.queryCall({
  functionName: "balance",
  args: [principal, []],
})
console.log("Response from CanisterB method:", await balance)
```

### Using Candid Adapter

The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition. It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
If both methods fail, it throws an error.

```typescript
import { createCandidAdapter } from "@ic-reactor/core"
import { agentManager } from "./agent"

const candidAdapter = createCandidAdapter({ agentManager })

const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

// Usage example
try {
  const definition = await candidAdapter.getCandidDefinition(canisterId)
  console.log(definition)
} catch (error) {
  console.error(error)
}
```

### Using `createReactorCore` with `CandidAdapter`

You can use the `candidAdapter` to fetch the Candid definition and then pass it to the `createReactorCore` function.

```typescript
import { createReactorCore, createCandidAdapter } from "@ic-reactor/core"
import { agentManager } from "./agent"

const candidAdapter = createCandidAdapter({ agentManager })

const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // NNS ICP Ledger Canister

// Usage example
try {
  const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)
  const { callMethod } = createReactorCore({
    agentManager,
    canisterId,
    idlFactory,
  })

  const name = await callMethod("name")
  console.log(name) // { name: 'Internet Computer' }
} catch (error) {
  console.error(error)
}
```

### Using store to lower level control

If you require more control over the state management, you can use the `createReactorStore` function to create a store that provides methods for querying and updating actors.

```typescript
import { createReactorStore } from "@ic-reactor/core"
import { candid, canisterId, idlFactory } from "./declarations/candid"

type Candid = typeof candid

const { agentManager, callMethod } = createReactorStore<Candid>({
  canisterId,
  idlFactory,
})

// Usage example
await agentManager.authenticate()
const authClient = agentManager.getAuth()

authClient?.login({
  onSuccess: () => {
    console.log("Logged in successfully")
  },
  onError: (error) => {
    console.error("Failed to login:", error)
  },
})

// Call a method
const version = callMethod("version")

console.log("Response from version method:", await version)
```

**IC Agent Example:**

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/core"

export const agentManager = createAgentManager() // Connects to IC network by default
```

**Local Agent Example:**

For development purposes, you might want to connect to a local instance of the IC network:

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/core"

export const agentManager = createAgentManager({
  withLocalEnv: true,
  port: 8000, // Default port is 4943
})
```

Alternatively, you can specify a host directly:

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/core"

export const agentManager = createAgentManager({
  host: "http://localhost:8000",
})
```

### Creating an Actor Manager

You can use Actor Managers to create your implementation of an actor. This allows you to manage the actor's lifecycle and state, as well as interact with the actor's methods.

```typescript
// actor.ts
import { createActorManager } from "@ic-reactor/core"
import { candid, canisterId, idlFactory } from "./declarations/candid"
import { agentManager } from "./agent"

type Candid = typeof candid

const candidActor = createActorManager<Candid>({
  agentManager,
  canisterId,
  idlFactory,
})

// Usage example
const data = await candidActor.callMethod("version")
console.log(data)
```
