# @ic-reactor/candid

Lightweight adapter for fetching and parsing Candid definitions from Internet Computer canisters.

## Features

- **Fetch Candid Definitions**: Retrieve Candid interface definitions from any canister
- **Multiple Retrieval Methods**: Supports both canister metadata and the temporary hack method
- **Local Parsing**: Use the optional WASM-based parser for fast, offline Candid compilation
- **Remote Fallback**: Falls back to the didjs canister for Candid-to-JavaScript compilation
- **Dynamic Reactor**: Includes `CandidReactor` for dynamic IDL fetching and interaction
- **Lightweight**: Uses raw `agent.query` calls - no Actor overhead
- **ClientManager Compatible**: Seamlessly integrates with `@ic-reactor/core`

## Installation

```bash
npm install @ic-reactor/candid @icp-sdk/core
```

### Optional: Local Parser

For faster Candid parsing without network requests:

```bash
npm install @ic-reactor/parser
```

## Usage

### With ClientManager (Recommended)

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

// Create and initialize ClientManager
const queryClient = new QueryClient()
const clientManager = new ClientManager({ queryClient })
await clientManager.initialize()

// Create the adapter
const adapter = new CandidAdapter({ clientManager })

// Get the Candid definition for a canister
const { idlFactory } = await adapter.getCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
```

### With Local Parser (Fastest)

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const queryClient = new QueryClient()
const clientManager = new ClientManager({ queryClient })
await clientManager.initialize()

const adapter = new CandidAdapter({ clientManager })

// Load the local parser for faster processing
await adapter.loadParser()

// Now parsing happens locally - no network requests
const { idlFactory } = await adapter.getCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
```

### CandidReactor (Dynamic Interaction)

`CandidReactor` extends the core `Reactor` class, allowing you to work with canisters without compile-time IDL. After initialization, **all standard Reactor methods work automatically**.

```typescript
import { CandidReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"

const clientManager = new ClientManager()
await clientManager.initialize()

// Option 1: Fetch Candid from network
const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
})
await reactor.initialize() // Fetches IDL from network

// Option 2: Provide Candid string directly (no network fetch)
const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  candid: `service : {
    icrc1_name : () -> (text) query;
    icrc1_balance_of : (record { owner : principal }) -> (nat) query;
  }`,
})
await reactor.initialize() // Parses provided Candid string

// Now use standard Reactor methods!
const name = await reactor.callMethod({ functionName: "icrc1_name" })
const balance = await reactor.fetchQuery({
  functionName: "icrc1_balance_of",
  args: [{ owner }],
})
```

#### Registering Methods Dynamically

You can also register individual methods on-the-fly:

```typescript
// Start with just a canister ID
const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
})

// Register a method by its Candid signature
await reactor.registerMethod({
  functionName: "icrc1_balance_of",
  candid: "(record { owner : principal }) -> (nat) query",
})

// Now all standard Reactor methods work with this method!
const balance = await reactor.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner }],
})

// With TanStack Query caching
const cachedBalance = await reactor.fetchQuery({
  functionName: "icrc1_balance_of",
  args: [{ owner }],
})

// Check registered methods
console.log(reactor.getMethodNames())
```

#### One-Shot Dynamic Calls

For quick one-off calls, use convenience methods that register and call in one step:

```typescript
// queryDynamic - register + call in one step
const symbol = await reactor.queryDynamic({
  functionName: "icrc1_symbol",
  candid: "() -> (text) query",
})

// callDynamic - for update calls
const result = await reactor.callDynamic({
  functionName: "transfer",
  candid:
    "(record { to : principal; amount : nat }) -> (variant { Ok : nat; Err : text })",
  args: [{ to: recipient, amount: 100n }],
})

// fetchQueryDynamic - with TanStack Query caching
const cachedBalance = await reactor.fetchQueryDynamic({
  functionName: "icrc1_balance_of",
  candid: "(record { owner : principal }) -> (nat) query",
  args: [{ owner }],
})
```

### Fetch Raw Candid Source

```typescript
const candidSource = await adapter.fetchCandidSource(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
console.log(candidSource)
// Output: service { greet: (text) -> (text) query; }
```

### Validate Candid Source

```typescript
await adapter.loadParser()

const isValid = adapter.validateCandid(`
  service {
    greet: (text) -> (text) query;
  }
`)
console.log(isValid) // true
```

### Compile Candid to JavaScript

```typescript
// Local compilation (requires parser)
await adapter.loadParser()
const jsCode = adapter.compileLocal("service { greet: (text) -> (text) query }")

// Remote compilation (uses didjs canister)
const jsCode = await adapter.compileRemote(
  "service { greet: (text) -> (text) query }"
)
```

## API Reference

### `CandidAdapter`

#### Constructor

```typescript
new CandidAdapter(params: CandidAdapterParameters)
```

| Parameter         | Type                  | Required | Description                                        |
| ----------------- | --------------------- | -------- | -------------------------------------------------- |
| `clientManager`   | `CandidClientManager` | Yes      | Client manager providing agent and identity access |
| `didjsCanisterId` | `string`              | No       | Custom didjs canister ID                           |

#### Properties

| Property          | Type                  | Description                                  |
| ----------------- | --------------------- | -------------------------------------------- |
| `clientManager`   | `CandidClientManager` | The client manager instance                  |
| `agent`           | `HttpAgent`           | The HTTP agent from the client manager       |
| `didjsCanisterId` | `string`              | The didjs canister ID for remote compilation |
| `hasParser`       | `boolean`             | Whether the local parser is loaded           |

#### Methods

##### Main API

| Method                            | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `getCandidDefinition(canisterId)` | Get parsed Candid definition (idlFactory + init) |
| `fetchCandidSource(canisterId)`   | Get raw Candid source string                     |
| `parseCandidSource(candidSource)` | Parse Candid source to definition                |

##### Parser Methods

| Method                         | Description                              |
| ------------------------------ | ---------------------------------------- |
| `loadParser(module?)`          | Load the local WASM parser               |
| `compileLocal(candidSource)`   | Compile Candid locally (requires parser) |
| `validateCandid(candidSource)` | Validate Candid source (requires parser) |

##### Fetch Methods

| Method                                          | Description                       |
| ----------------------------------------------- | --------------------------------- |
| `fetchFromMetadata(canisterId)`                 | Get Candid from canister metadata |
| `fetchFromTmpHack(canisterId)`                  | Get Candid via tmp hack method    |
| `compileRemote(candidSource, didjsCanisterId?)` | Compile Candid via didjs canister |

##### Cleanup

| Method          | Description                          |
| --------------- | ------------------------------------ |
| `unsubscribe()` | Cleanup identity change subscription |

### `CandidReactor`

Extends `Reactor` from `@ic-reactor/core`.

#### Constructor

```typescript
new CandidReactor(config: CandidReactorParameters)
```

| Parameter       | Type               | Required | Description                                      |
| --------------- | ------------------ | -------- | ------------------------------------------------ |
| `canisterId`    | `CanisterId`       | Yes      | The canister ID to interact with                 |
| `clientManager` | `ClientManager`    | Yes      | Client manager from `@ic-reactor/core`           |
| `candid`        | `string`           | No       | Candid service definition (avoids network fetch) |
| `idlFactory`    | `InterfaceFactory` | No       | IDL factory (if already available)               |
| `actor`         | `A`                | No       | Existing actor instance                          |

#### Methods

| Method                       | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `initialize()`               | Parse provided Candid or fetch from network, update service |
| `registerMethod(options)`    | Register a method by its Candid signature                   |
| `registerMethods(methods)`   | Register multiple methods at once                           |
| `hasMethod(functionName)`    | Check if a method is registered                             |
| `getMethodNames()`           | Get all registered method names                             |
| `callDynamic(options)`       | One-shot: register + update call                            |
| `queryDynamic(options)`      | One-shot: register + query call                             |
| `fetchQueryDynamic(options)` | One-shot: register + cached query                           |

After initialization or registration, all standard `Reactor` methods work:

- `callMethod()` - Execute a method call
- `fetchQuery()` - Fetch with TanStack Query caching
- `getQueryOptions()` - Get query options for React hooks
- `invalidateQueries()` - Invalidate cached queries
- etc.

### Types

```typescript
interface CandidDefinition {
  idlFactory: IDL.InterfaceFactory
  init?: (args: { IDL: typeof IDL }) => IDL.Type<unknown>[]
}

interface CandidAdapterParameters {
  clientManager: CandidClientManager
  didjsCanisterId?: string
}

interface CandidClientManager {
  agent: HttpAgent
  isLocal: boolean
  subscribe(callback: (identity: Identity) => void): () => void
}

type CanisterId = string | Principal
```

## How It Works

1. **Fetching Candid**: The adapter first tries to get the Candid definition from the canister's metadata. If that fails, it falls back to calling the `__get_candid_interface_tmp_hack` query method.

2. **Parsing Candid**: Once the raw Candid source is retrieved, it needs to be compiled to JavaScript:
   - First tries the local WASM parser (if loaded) - instant, no network
   - Falls back to the remote didjs canister - requires network request

3. **Evaluation**: The compiled JavaScript is dynamically imported to extract the `idlFactory` and optional `init` function.

4. **Dynamic Execution**: For `call` and `query` methods, the adapter wraps the provided Candid signature in a temporary service definition, compiles it to an `idlFactory`, and then uses an `Actor` to encode arguments and execute the call reliably.

5. **Identity Changes**: The adapter subscribes to identity changes from the ClientManager. When the identity changes, it re-evaluates the default didjs canister ID (unless a custom one was provided).

## Standalone Usage

The `CandidClientManager` interface is simple enough that you can implement it yourself without `@ic-reactor/core`:

```typescript
import { HttpAgent } from "@icp-sdk/core/agent"
import { CandidAdapter } from "@ic-reactor/candid"

// Create a minimal client manager implementation
const clientManager = {
  agent: await HttpAgent.create({ host: "https://ic0.app" }),
  isLocal: false,
  subscribe: () => () => {}, // No-op subscription
}

const adapter = new CandidAdapter({ clientManager })
```

## License

MIT
