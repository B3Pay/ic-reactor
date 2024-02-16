# IC-ReActor - Store

`@ic-reactor/store` is a state management library designed for applications interacting with the Internet Computer (IC) blockchain. It facilitates the management of actor states, authentication processes, and seamless interaction with IC actors, leveraging the power of `zustand` for global state management.

## Features

- **Actor State Management**: Efficiently manage and update the state of IC actors.
- **Authentication Handling**: Integrated functionality for managing authentication with IC.
- **Zustand Integration**: Utilize `zustand` for global state management in a React-friendly way.
- **Error and Loading State Management**: Easily handle loading states and errors across your application.
- **Asynchronous Interaction Support**: Built-in support for managing asynchronous interactions with IC actors.

## Installation

Install the package using npm:

```bash
npm install @ic-reactor/store
```

or using yarn:

```bash
yarn add @ic-reactor/store
```

## Usage

You can this packages in two ways:

1. **Automatic Agent Creation**: You can use the `createReActorStore` factory function to create a new ReActor store instance. This will automatically create an agent and manage its state for you.

```ts
import { createReActorStore } from "@ic-reactor/store"
import { candid, canisterId, idlFactory } from "./candid"

type Candid = typeof candid

const { callMethod, agentManager } = createReActorStore<Candid>({
  canisterId,
  idlFactory,
})

// later in your code
const identity = await agentManager.authenticate()
const data = await callMethod("version")
```

2. **Manual Agent Creation**: You can use the `createAgentManager` to manually create and manage an agent instance.

- IC Agent

```ts
// agent.ts
import { createAgentManager } from "@ic-reactor/store"

export const agentManager = createAgentManager() // connect to the default ic network

// later in your code
const identity = await agentManager.authenticate()
```

- Local Agent

```ts
// agent.ts
import { createAgentManager } from "@ic-reactor/store"

export const agentManager = createAgentManager({
  isLocalEnv: true,
  port: 8000, // default port is 4943
})
```

- Or you can use the host option directly

```ts
export const agentManager = createAgentManager({
  host: "http://localhost:8000",
})
```

then you can use the "createActorManager" to create an actor manager

```ts
// actor.ts
import { createActorManager } from "@ic-reactor/store"
import { candid, canisterId, idlFactory } from "./candid"
import { agentManager } from "./agent"

type Candid = typeof candid

const actorManager = createActorManager<Candid>({
  agentManager,
  canisterId,
  idlFactory,
})

// later in your code
const data = await actorManager.callMethod("version")
```
