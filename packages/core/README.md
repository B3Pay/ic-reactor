# @ic-reactor/store

The `@ic-reactor/store` package provides a streamlined way to interact with the Internet Computer (IC) by simplifying agent and actor management. It offers utilities for creating and managing IC agents, enabling seamless communication with canisters through a friendly API.

## Installation

To get started with `@ic-reactor/store`, you can install the package using npm or Yarn:

**Using npm:**

```bash
npm install @ic-reactor/store
```

**Using Yarn:**

```bash
yarn add @ic-reactor/store
```

## Usage

`@ic-reactor/store` can be utilized in two primary ways: automatic agent creation and manual agent management. Below are examples of both approaches to suit your project's needs.

### Automatic Agent Creation

For ease of use, the `createReActorStore` factory function automatically sets up a new ReActor store instance, managing the agent and its state internally.

**Example:**

```typescript
import { createReActorStore } from "@ic-reactor/store"
import { candid, canisterId, idlFactory } from "./candid"

type Candid = typeof candid

const { callMethod, authenticate } = createReActor<Candid>({
  canisterId,
  idlFactory,
})

// Usage example
const identity = await authenticate()
const data = await callMethod("version")
console.log(data)
```

### Manual Agent Creation

If you require more control over the agent's lifecycle or configuration, `@ic-reactor/store` provides the `createAgentManager` function for manual agent instantiation.

**IC Agent Example:**

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/store"

export const agentManager = createAgentManager() // Connects to IC network by default

// Usage example
await agentManager.authenticate()
// Then use the store to access the authClient, identity, and more...
const { authClient, identity, authenticating } =
  agentManager.authStore.getState()
```

**Local Agent Example:**

For development purposes, you might want to connect to a local instance of the IC network:

```typescript
// agent.ts
import { createAgentManager } from "@ic-reactor/store"

export const agentManager = createAgentManager({
  isLocalEnv: true,
  port: 8000, // Default port is 4943
})
```

Alternatively, you can specify a host directly:

```typescript
export const agentManager = createAgentManager({
  host: "http://localhost:8000",
})
```

### Creating an Actor Manager

Once you have an agent manager, use `createActorManager` to instantiate an actor manager for calling methods on your canisters.

```typescript
// actor.ts
import { createActorManager } from "@ic-reactor/store"
import { candid, canisterId, idlFactory } from "./candid"
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

### Managing Multiple Actors

When interacting with multiple canisters using `@ic-reactor/store`, you can create separate actor managers for each canister. This enables modular interaction with different services on the Internet Computer. Here's how to adjust the example to handle methods that require multiple arguments:

**Creating Actor Managers:**

First, ensure you have your actor managers set up for each canister:

```typescript
// Assuming you've already set up `candidA`, `candidB`, `canisterIdA`, `canisterIdB`, and `agentManager`

import { createActorManager } from "@ic-reactor/store"
import { candidA, canisterIdA } from "./candidA"
import { candidB, canisterIdB } from "./candidB"
import { agentManager } from "./agent"

type CandidA = typeof candidA
type CandidB = typeof candidB

const actorA = createActorManager<CandidA>({
  agentManager,
  canisterId: canisterIdA,
  idlFactory: candidA.idlFactory,
})

const actorB = createActorManager<CandidB>({
  agentManager,
  canisterId: canisterIdB,
  idlFactory: candidB.idlFactory,
})
```

### Using `callMethod` with Multiple Arguments

To call a method on a canister that requires multiple arguments, pass the method name followed by the arguments as separate parameters to `callMethod`:

```typescript
// Example usage with CanisterA calling a method that requires one argument
const responseA = await actorA.callMethod("otherMethod", "arg1")
console.log("Response from CanisterA method:", responseA)

// Example usage with CanisterB calling a different method also with two arguments
const responseB = await actorB.callMethod("anotherMethod", "arg1", "arg2")
console.log("Response from CanisterB method:", responseB)
```

### Using Candid Adapter

The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition. It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
If both methods fail, it throws an error.

```typescript
import { createCandidAdapter } from "@ic-reactor/store"
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

### Using `createReActorStore` with `CandidAdapter`

You can use the `candidAdapter` to fetch the Candid definition and then pass it to the `createReActorStore` function.

```typescript
import { createReActorStore, createCandidAdapter } from "@ic-reactor/store"
import { agentManager } from "./agent"

const candidAdapter = createCandidAdapter({ agentManager })

const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // NNS ICP Ledger Canister

// Usage example
try {
  const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)
  const { callMethod } = createReActorStore({
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

## Conclusion

The `@ic-reactor/store` package offers a flexible and powerful way to interact with the Internet Computer, catering to both straightforward use cases with automatic agent management and more complex scenarios requiring manual control. By abstracting away some of the intricacies of agent and actor management, it enables developers to focus more on building their applications.
