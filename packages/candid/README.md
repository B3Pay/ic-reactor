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
- **Agent Integration**: Works with HTTP agents and agent managers

## Usage

### Basic Usage

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { HttpAgent, Actor } from "@icp-sdk/core/agent"

// Create an agent
const agent = await HttpAgent.create()

// Create the adapter
const adapter = new CandidAdapter({ agent })

// Get the Candid definition for a canister
const { idlFactory } = await adapter.getCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)

// Use it to create an actor
const actor = Actor.createActor(idlFactory, {
  agent,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
```

### With Local Parser (Recommended)

For faster processing without network requests:

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { HttpAgent } from "@icp-sdk/core/agent"

const agent = await HttpAgent.create()
const adapter = new CandidAdapter({ agent })

// Initialize the local parser
await adapter.initializeParser()

// Now parsing happens locally - faster and works offline
const { idlFactory } = await adapter.getCandidDefinition(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
)
```

### With Agent Manager

If you're using an agent manager that handles agent lifecycle:

```typescript
import { CandidAdapter } from "@ic-reactor/candid"
import { createClientManager } from "@ic-reactor/core"

const clientManager = createClientManager()
const adapter = new CandidAdapter({ agentManager: clientManager })

// The adapter will automatically update when the agent changes
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

| Parameter         | Type           | Required | Description                     |
| ----------------- | -------------- | -------- | ------------------------------- |
| `agent`           | `HttpAgent`    | No\*     | The HTTP agent to use           |
| `agentManager`    | `AgentManager` | No\*     | Agent manager for subscriptions |
| `didjsCanisterId` | `string`       | No       | Custom didjs canister ID        |

\*Either `agent` or `agentManager` must be provided.

#### Methods

| Method                                         | Description                       |
| ---------------------------------------------- | --------------------------------- |
| `initializeParser(module?)`                    | Initialize the local WASM parser  |
| `getCandidDefinition(canisterId)`              | Get parsed Candid definition      |
| `fetchCandidDefinition(canisterId)`            | Get raw Candid source string      |
| `getFromMetadata(canisterId)`                  | Get Candid from canister metadata |
| `getFromTmpHack(canisterId)`                   | Get Candid via tmp hack method    |
| `evaluateCandidDefinition(data)`               | Parse Candid string to definition |
| `fetchDidTojs(candidSource, didjsCanisterId?)` | Compile Candid remotely           |
| `parseDidToJs(candidSource)`                   | Compile Candid locally            |
| `validateIDL(candidSource)`                    | Validate Candid source            |

### Types

```typescript
interface CandidDefinition {
  idlFactory: IDL.InterfaceFactory
  init?: (args: { IDL: typeof IDL }) => IDL.Type<unknown>[]
}

interface CandidAdapterParameters {
  agent?: HttpAgent
  agentManager?: AgentManager
  didjsCanisterId?: string
}

type CanisterId = string | Principal
```

## How It Works

1. **Fetching Candid**: The adapter first tries to get the Candid definition from the canister's metadata. If that fails, it falls back to calling the `__get_candid_interface_tmp_hack` query method.

2. **Parsing Candid**: Once the raw Candid source is retrieved, it needs to be compiled to JavaScript. The adapter:
   - First tries the local WASM parser (if initialized) - instant, no network
   - Falls back to the remote didjs canister - requires network request

3. **Evaluation**: The compiled JavaScript is then dynamically imported to extract the `idlFactory` and optional `init` function.

## License

MIT
