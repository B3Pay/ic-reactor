# @ic-reactor/candid

Fetch and parse Candid definitions from Internet Computer canisters.

## Installation

```bash
npm install @ic-reactor/candid @icp-sdk/core
```

### Optional: Local Parser

For faster Candid parsing without network requests, install the optional parser:

```bash
npm install @ic-reactor/parser
```

## Features

- **Fetch Candid Definitions**: Retrieve Candid interface definitions from any canister
- **Multiple Retrieval Methods**: Supports both canister metadata and the temporary hack method
- **Local Parsing**: Use the WASM-based parser for fast, offline Candid compilation
- **Remote Fallback**: Falls back to the didjs canister for Candid-to-JavaScript compilation
- **ClientManager Integration**: Seamlessly integrates with `@ic-reactor/core` ClientManager

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

// Use it to create an actor
import { Actor } from "@icp-sdk/core/agent"

const actor = Actor.createActor(idlFactory, {
  agent: clientManager.agent,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
```

### With Local Parser (Recommended for Performance)

For faster processing without network requests:

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const queryClient = new QueryClient()
const clientManager = new ClientManager({ queryClient })
await clientManager.initialize()

const adapter = new CandidAdapter({ clientManager })

// Initialize the local parser
await adapter.initializeParser()

// Now parsing happens locally - faster and works offline
const { idlFactory } = await adapter.getCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
```

### Fetch Raw Candid Definition

To get the raw Candid (DID) source:

```typescript
const candidSource = await adapter.fetchCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
console.log(candidSource)
// Output: service { ... }
```

### Validate Candid Source

With the local parser, you can validate Candid source:

```typescript
await adapter.initializeParser()

const isValid = adapter.validateIDL(`
  service {
    greet: (text) -> (text) query;
  }
`)
console.log(isValid) // true
```

## API Reference

### `CandidAdapter`

#### Constructor

```typescript
new CandidAdapter(params: CandidAdapterParameters)
```

| Parameter         | Type                  | Required | Description                                            |
| ----------------- | --------------------- | -------- | ------------------------------------------------------ |
| `clientManager`   | `CandidClientManager` | Yes      | The client manager providing agent and identity access |
| `didjsCanisterId` | `string`              | No       | Custom didjs canister ID                               |

#### Properties

| Property          | Type                  | Description                                  |
| ----------------- | --------------------- | -------------------------------------------- |
| `clientManager`   | `CandidClientManager` | The client manager instance                  |
| `agent`           | `HttpAgent`           | The HTTP agent from the client manager       |
| `didjsCanisterId` | `string`              | The didjs canister ID for remote compilation |

#### Methods

| Method                                         | Description                          |
| ---------------------------------------------- | ------------------------------------ |
| `initializeParser(module?)`                    | Initialize the local WASM parser     |
| `getCandidDefinition(canisterId)`              | Get parsed Candid definition         |
| `fetchCandidDefinition(canisterId)`            | Get raw Candid source string         |
| `getFromMetadata(canisterId)`                  | Get Candid from canister metadata    |
| `getFromTmpHack(canisterId)`                   | Get Candid via tmp hack method       |
| `evaluateCandidDefinition(data)`               | Parse Candid string to definition    |
| `fetchDidTojs(candidSource, didjsCanisterId?)` | Compile Candid remotely              |
| `parseDidToJs(candidSource)`                   | Compile Candid locally               |
| `validateIDL(candidSource)`                    | Validate Candid source               |
| `unsubscribe()`                                | Cleanup identity change subscription |

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

2. **Parsing Candid**: Once the raw Candid source is retrieved, it needs to be compiled to JavaScript. The adapter:
   - First tries the local WASM parser (if initialized) - instant, no network
   - Falls back to the remote didjs canister - requires network request

3. **Evaluation**: The compiled JavaScript is then dynamically imported to extract the `idlFactory` and optional `init` function.

4. **Identity Changes**: The adapter subscribes to identity changes from the ClientManager. When the identity changes, it re-evaluates the default didjs canister ID (unless a custom one was provided).

## Integration with @ic-reactor/core

The `CandidAdapter` is designed to work seamlessly with the `ClientManager` from `@ic-reactor/core`. The `CandidClientManager` interface matches the `ClientManager` class:

```typescript
import { ClientManager } from "@ic-reactor/core"
import { CandidAdapter } from "@ic-reactor/candid"

// ClientManager implements CandidClientManager interface
const clientManager = new ClientManager({ queryClient })
const adapter = new CandidAdapter({ clientManager })
```

## License

MIT
