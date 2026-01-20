# @ic-reactor/core

<div align="center">
  <strong>The Core Library for Internet Computer Applications</strong>
  <br><br>
  
  [![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
</div>

---

Framework-agnostic core library for building type-safe Internet Computer applications with [TanStack Query](https://tanstack.com/query) integration.

> **Note**: For React applications, use [`@ic-reactor/react`](../react) instead, which re-exports everything from this package plus React-specific hooks.

## Features

- 🔒 **End-to-End Type Safety** — From Candid to your application
- ⚡ **TanStack Query Integration** — Automatic caching, background refetching, optimistic updates
- 🔄 **Auto Transformations** — `DisplayReactor` converts BigInt to string, Principal to text
- 📦 **Result Unwrapping** — Automatic `Ok`/`Err` handling from Candid Result types
- 🔐 **Internet Identity** — Built-in authentication with session restoration
- 🏗️ **Multi-Canister Support** — Shared authentication across canisters

## Installation

```bash
# Core library
npm install @ic-reactor/core @icp-sdk/core @tanstack/query-core

# Optional: For Internet Identity authentication
npm install @icp-sdk/auth
```

## Core Concepts

### Architecture Overview

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────────┐
│  ClientManager  │───▶│   Reactor    │───▶│  TanStack Query     │
│  (Agent + Auth) │    │  (Canister)  │    │  (Caching Layer)    │
└─────────────────┘    └──────────────┘    └─────────────────────┘
         │                    │
         │              ┌─────▼─────┐
         │              │ Display   │
         │              │ Reactor   │
         │              └───────────┘
         │              (Type Transforms)
         ▼
┌─────────────────┐
│ Internet        │
│ Identity        │
└─────────────────┘
```

## Quick Start

### 1. Create ClientManager

The `ClientManager` handles the IC agent, authentication, and query client:

```typescript
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000 }, // 5 minutes
  },
})

const clientManager = new ClientManager({
  queryClient,
  withProcessEnv: true, // Reads DFX_NETWORK from environment
})

// Initialize agent and restore session
await clientManager.initialize()
```

### 2. Create Reactor

The `Reactor` class wraps a canister with type-safe methods and caching:

```typescript
import { Reactor } from "@ic-reactor/core"
import { idlFactory, type _SERVICE } from "./declarations/my_canister"

const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend", // Required: explicit name
  // canisterId: "...", // Optional: omitted if using environment variables
})
```

### 3. Call Methods

```typescript
// Direct call (no caching)
const greeting = await backend.callMethod({
  functionName: "greet",
  args: ["World"],
})

// Fetch with caching
const cachedGreeting = await backend.fetchQuery({
  functionName: "greet",
  args: ["World"],
})

// Get from cache (no network call)
const fromCache = backend.getQueryData({
  functionName: "greet",
  args: ["World"],
})

// Invalidate cache
backend.invalidateQueries({ functionName: "greet" })
```

## ClientManager API

### Constructor Options

```typescript
interface ClientManagerParameters {
  queryClient: QueryClient // TanStack Query client
  port?: number // Local replica port (default: 4943)
  withLocalEnv?: boolean // Force local network
  withProcessEnv?: boolean // Read DFX_NETWORK from env
  withCanisterEnv?: boolean // Read canister IDs from environment
  agentOptions?: HttpAgentOptions // Custom agent options
  authClient?: AuthClient // Pre-configured auth client
}
```

### Authentication Methods

```typescript
// Initialize agent and restore previous session
await clientManager.initialize()

// Trigger login flow (opens Internet Identity)
await clientManager.login({
  identityProvider: "https://identity.ic0.app", // optional, auto-detected
  onSuccess: () => console.log("Logged in!"),
  onError: (error) => console.error(error),
})

// Logout and revert to anonymous identity
await clientManager.logout()

// Manually authenticate (restore session)
const identity = await clientManager.authenticate()
```

### State Subscriptions

```typescript
// Subscribe to agent state changes
const unsubAgent = clientManager.subscribeAgentState((state) => {
  console.log("Agent state:", state.isInitialized, state.network)
})

// Subscribe to auth state changes
const unsubAuth = clientManager.subscribeAuthState((state) => {
  console.log("Auth state:", state.isAuthenticated, state.identity)
})

// Subscribe to identity changes
const unsubIdentity = clientManager.subscribe((identity) => {
  console.log("New identity:", identity.getPrincipal().toText())
})

// Cleanup
unsubAgent()
unsubAuth()
unsubIdentity()
```

### Properties

```typescript
clientManager.agent // HttpAgent instance
clientManager.agentState // { isInitialized, isInitializing, error, network, isLocalhost }
clientManager.authState // { identity, isAuthenticated, isAuthenticating, error }
clientManager.queryClient // TanStack QueryClient
clientManager.network // "ic" | "local"
clientManager.isLocal // boolean
```

## Reactor API

### Constructor Options

```typescript
interface ReactorParameters<A> {
  clientManager: ClientManager
  idlFactory: IDL.InterfaceFactory
  name: string // Required display name
  canisterId?: string | Principal // Optional if using env vars
  pollingOptions?: PollingOptions // Custom polling for update calls
}
```

### Core Methods

```typescript
// Call a canister method (auto-detects query vs update)
const result = await reactor.callMethod({
  functionName: "my_method",
  args: [arg1, arg2],
  callConfig: { effectiveCanisterId: ... }, // optional
})

// Fetch and cache data
const data = await reactor.fetchQuery({
  functionName: "get_data",
  args: [],
})

// Get cached data (synchronous, no network)
const cached = reactor.getQueryData({
  functionName: "get_data",
  args: [],
})

// Invalidate cached queries
reactor.invalidateQueries() // all queries for this canister
reactor.invalidateQueries({ functionName: "get_data" }) // specific method
reactor.invalidateQueries({ functionName: "get_user", args: ["user-1"] }) // specific args

// Get query options for TanStack Query
const options = reactor.getQueryOptions({ functionName: "get_data" })
```

### Properties

```typescript
reactor.canisterId // Principal
reactor.service // IDL.ServiceClass
reactor.queryClient // TanStack QueryClient
reactor.agent // HttpAgent
reactor.name // string
```

## DisplayReactor

`DisplayReactor` extends `Reactor` with automatic type transformations for UI-friendly values:

### Type Transformations

| Candid Type                      | Reactor (raw) | DisplayReactor |
| -------------------------------- | ------------- | -------------- |
| `nat`, `int`                     | `bigint`      | `string`       |
| `nat8/16/32/64`, `int8/16/32/64` | `bigint`      | `string`       |
| `Principal`                      | `Principal`   | `string`       |
| `vec nat8` (≤32 bytes)           | `Uint8Array`  | `string` (hex) |
| `Result<Ok, Err>`                | Unwrapped     | Unwrapped      |

### Usage

```typescript
import { DisplayReactor } from "@ic-reactor/core"

const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})

// Args and results use display-friendly types
const balance = await backend.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa", subaccount: [] }], // string instead of Principal
})
// balance is "100000000" (string) instead of 100000000n (bigint)
```

### Form Validation

`DisplayReactor` supports validators for mutation arguments:

```typescript
import { DisplayReactor, ValidationError } from "@ic-reactor/core"

const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: "...",
  validators: {
    transfer: (args) => {
      const [{ to, amount }] = args
      const issues = []

      if (!to || to.length < 5) {
        issues.push({ path: ["to"], message: "Invalid recipient" })
      }
      if (!amount || parseFloat(amount) <= 0) {
        issues.push({ path: ["amount"], message: "Amount must be positive" })
      }

      return issues.length > 0 ? { success: false, issues } : { success: true }
    },
  },
})

// Validate before calling
const result = await backend.validate("transfer", [{ to: "", amount: "0" }])
if (!result.success) {
  console.log(result.issues) // [{ path: ["to"], message: "Invalid recipient" }, ...]
}

// Or call with validation (throws ValidationError on failure)
try {
  await backend.callMethodWithValidation({
    functionName: "transfer",
    args: [{ to: "", amount: "0" }],
  })
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.issues)
  }
}
```

## Error Handling

### Error Types

```typescript
import {
  CallError,
  CanisterError,
  ValidationError,
  isCallError,
  isCanisterError,
  isValidationError,
} from "@ic-reactor/core"
```

| Error Type         | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `CallError`        | Network/agent errors (canister not found, timeout, etc.) |
| `CanisterError<E>` | Canister returned an `Err` result                        |
| `ValidationError`  | Argument validation failed (DisplayReactor)              |

### Handling Errors

```typescript
try {
  await backend.callMethod({
    functionName: "transfer",
    args: [{ to: principal, amount: 100n }],
  })
} catch (error) {
  if (isCanisterError(error)) {
    // Business logic error from canister
    console.log("Canister error:", error.code, error.err)
    // error.err is typed based on your Candid Result type
  } else if (isCallError(error)) {
    // Network/agent error
    console.log("Network error:", error.message)
  } else if (isValidationError(error)) {
    // Validation error (DisplayReactor only)
    console.log("Validation failed:", error.issues)
  }
}
```

### CanisterError Properties

```typescript
interface CanisterError<E> {
  err: E // The raw error value from canister
  code: string // Error code (from variant key or "code" field)
  message: string // Human-readable message
  details?: Map<string, string> // Optional details
}
```

## Utilities

### Result Unwrapping

Results are automatically unwrapped. The `extractOkResult` utility handles both uppercase (`Ok`/`Err`) and lowercase (`ok`/`err`) variants:

```typescript
import { extractOkResult } from "@ic-reactor/core"

// Candid: Result<Text, TransferError>
// Returns the Ok value or throws CanisterError with the Err value
const result = extractOkResult({ Ok: "success" }) // "success"
const result2 = extractOkResult({ ok: "success" }) // "success"
```

### Query Key Generation

```typescript
const queryKey = reactor.generateQueryKey({
  functionName: "get_user",
  args: ["user-123"],
})
// ["canister-id", "get_user", "serialized-args"]
```

## TypeScript Types

### Actor Types

```typescript
import type {
  FunctionName, // Method names from actor service
  ActorMethodParameters, // Parameter types for a method
  ActorMethodReturnType, // Return type for a method
  ReactorArgs, // Args with optional transforms
  ReactorReturnOk, // Return type (Ok extracted from Result)
  ReactorReturnErr, // Error type (Err from Result)
} from "@ic-reactor/core"
```

### State Types

```typescript
import type { AgentState, AuthState } from "@ic-reactor/core"

interface AgentState {
  isInitialized: boolean
  isInitializing: boolean
  error: Error | undefined
  network: "ic" | "local" | undefined
  isLocalhost: boolean
}

interface AuthState {
  identity: Identity | null
  isAuthenticated: boolean
  isAuthenticating: boolean
  error: Error | undefined
}
```

## Advanced Usage

### Multiple Canisters

```typescript
const clientManager = new ClientManager({ queryClient, withProcessEnv: true })

// All reactors share the same agent and authentication
const backend = new Reactor<Backend>({
  clientManager,
  idlFactory: backendIdl,
  canisterId: "...",
})
const ledger = new DisplayReactor<Ledger>({
  clientManager,
  idlFactory: ledgerIdl,
  canisterId: "...",
})
const nft = new Reactor<NFT>({
  clientManager,
  idlFactory: nftIdl,
  canisterId: "...",
})

// Login once, all canisters use the same identity
await clientManager.login()
```

### Custom Polling Options

```typescript
const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: "...",
  pollingOptions: {
    maxRetries: 5,
    strategyFactory: () => /* custom strategy */,
  },
})
```

### Direct Agent Access

```typescript
// Get subnet ID
const subnetId = await backend.subnetId()

// Read subnet state
const state = await backend.subnetState({ paths: [...] })

// Access underlying agent
const agent = backend.agent
```

## Documentation

For comprehensive guides and API reference, visit the [documentation site](https://b3pay.github.io/ic-reactor/v3).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)
