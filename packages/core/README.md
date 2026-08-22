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
- 🔑 **Identity Aware** — Swap the agent identity at runtime and invalidate the affected queries
- 🏗️ **Multi-Canister Support** — One agent and one cache shared across canisters

## Installation

```bash
npm install @ic-reactor/core @icp-sdk/core @tanstack/query-core
```

> **Note**: Internet Identity is not part of this package. `AuthenticationManager`,
> `IdentityAttributesManager` and the optional `@icp-sdk/auth` peer live in
> [`@ic-reactor/react`](../react).

## Core Concepts

### Architecture Overview

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────────┐
│  ClientManager  │───▶│   Reactor    │───▶│  TanStack Query     │
│ (Agent + Cache) │    │  (Canister)  │    │  (Caching Layer)    │
└─────────────────┘    └──────────────┘    └─────────────────────┘
                              │
                        ┌─────▼─────┐
                        │ Display   │
                        │ Reactor   │
                        └───────────┘
                        (Type Transforms)
```

## Quick Start

### 1. Create ClientManager

The `ClientManager` handles the IC agent and the query client:

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
})

// Initialize the agent (fetches the root key on non-mainnet hosts)
await clientManager.initialize()
```

The network is detected automatically: in the browser from the serving origin,
in Node/SSR from `ICP_NETWORK` / `DFX_NETWORK`. Pass `agentOptions.host` to
override it.

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
  queryClient: QueryClient // TanStack Query client (required)
  agentOptions?: HttpAgentOptions // Custom HttpAgent options (host, identity, rootKey, ...)
}
```

### Authentication

Authentication is **not** part of `@ic-reactor/core`. `ClientManager` only holds
the active identity and re-signs the agent when it changes. Internet Identity
sign-in lives in `AuthenticationManager` from
[`@ic-reactor/react`](../react), which also owns the optional `@icp-sdk/auth`
peer and the `IdentityAttributesManager` used for signed OpenID attributes:

```typescript
import { AuthenticationManager } from "@ic-reactor/react"

const authentication = new AuthenticationManager({ clientManager })

// Preload the auth module so login() can open the identity provider window
// synchronously inside a click handler (browser popup blockers require this).
await authentication.prepareClient()

await authentication.login({
  onSuccess: () => console.log("Logged in!"),
  onError: (error) => console.error(error),
})

await authentication.logout()

// Restore a previous session
const identity = await authentication.authenticate()
```

Signing in calls `clientManager.updateAgent(identity)`, which replaces the
agent's identity, notifies identity subscribers, and invalidates the cached
queries of every connected canister.

### State Subscriptions

```typescript
// Subscribe to agent state changes
const unsubAgent = clientManager.subscribeAgentState((state) => {
  console.log("Agent state:", state.isInitialized, state.network)
})

// Subscribe to identity changes
const unsubIdentity = clientManager.subscribe((identity) => {
  console.log("New identity:", identity.getPrincipal().toText())
})

// Cleanup
unsubAgent()
unsubIdentity()
```

Auth state (`isAuthenticated`, `identity`, …) is published by
`authentication.subscribeAuthState()` in `@ic-reactor/react`.

### Properties

```typescript
clientManager.agent // HttpAgent instance
clientManager.agentState // { isInitialized, isInitializing, error, network, isLocalhost }
clientManager.queryClient // TanStack QueryClient
clientManager.network // "local" | "remote" | "ic"
clientManager.isLocal // boolean — true whenever network !== "ic"

// Async: forwards HttpAgent.getPrincipal()
const principal = await clientManager.getUserPrincipal()
```

## Reactor API

### Constructor Options

```typescript
interface ReactorParameters {
  clientManager: ClientManager
  name: string // Required: also the ic_env lookup key
  idlFactory: (IDL: any) => any
  canisterId?: string | Principal // Optional: resolved from the ic_env cookie via name
  pollingOptions?: PollingOptions // Custom polling for update calls
}
```

When `canisterId` is omitted, it is resolved from the `ic_env` cookie under the
key `PUBLIC_CANISTER_ID:<name>`; the constructor throws if it is not there.

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
  callConfig: { canisterId: otherCanisterId }, // optional per-call cache partition
})

// Get cached data (synchronous, no network)
const cached = reactor.getQueryData({
  functionName: "get_data",
  args: [],
}, { canisterId: otherCanisterId })

// Invalidate cached queries
reactor.invalidateQueries() // all queries for this canister
reactor.invalidateQueries({ functionName: "get_data" }) // specific method
reactor.invalidateQueries({ functionName: "get_user", args: ["user-1"] }) // specific args
reactor.invalidateQueries({ functionName: "get_data" }, {
  canisterId: otherCanisterId,
}) // specific overridden canister

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

| Candid Type                | Reactor (raw) | DisplayReactor          |
| -------------------------- | ------------- | ----------------------- |
| `nat`, `int`               | `bigint`      | `string`                |
| `nat8/16/32`, `int8/16/32` | `number`      | `number`                |
| `nat64`, `int64`           | `bigint`      | `string`                |
| `Principal`                | `Principal`   | `string`                |
| `vec nat8` (blob)          | `Uint8Array`  | `string` (hex, no `0x`) |
| `Result<Ok, Err>`          | Unwrapped     | Unwrapped               |

Fixed-width integers up to 32 bits stay numbers on both sides; only the 64-bit
types cross the `bigint` ↔ `string` boundary. On encode, the ≤32-bit codecs also
accept numeric strings so form inputs can be submitted directly.

### Usage

```typescript
import { DisplayReactor } from "@ic-reactor/core"

const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
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
  name: "backend",
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

A method returning `variant { Ok : T; Err : E }` does not hand you the raw
variant. The Reactor's default `transformResult` unwraps it, so `data` is `T`
and an `Err` is thrown as a `CanisterError` carrying the `Err` payload — which
means it reaches the query/mutation `error` channel rather than `data`. This
happens at the candid-decoded layer, after the call has already succeeded at the
transport level, so a canister-level `Err` stays distinguishable from a
`CallError`.

Declare the service with the raw candid shape; the unwrapping applies on top of
it, and `ReactorReturnOk` is the type the hooks actually give you. The thrown
`CanisterError` carries the raw payload on `.err`.

To keep the raw variant instead, override `transformResult` on a Reactor
subclass — that is the only way, since `callMethod()` passes its decoded
response through `transformResult` as well.

The same logic is exported as `extractOkResult`, which handles both uppercase
(`Ok`/`Err`) and lowercase (`ok`/`err`) variants:

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
// [reactor.canisterId.toString(), "get_user", '["user-123"]']

const scopedKey = reactor.generateQueryKey(
  {
    functionName: "get_user",
    args: ["user-123"],
  },
  {
    canisterId: otherCanisterId,
    effectiveCanisterId: managementCanisterId, // optional
  }
)
// [otherCanisterId, "get_user", { effectiveTarget: { canisterId: managementCanisterId } }, '["user-123"]']
```

The key shape is
`[resolvedCanisterId, functionName, { effectiveTarget }?, argKey?, ...queryKey]`.
`argKey` is a single string — `JSON.stringify(args)` with `bigint` rendered as a
decimal string — not the individual arguments. The `{ effectiveTarget }` segment
is dropped when it names the same canister the key is already rooted at, and any
custom `queryKey` is appended element-wise.

If you pass `callConfig` to `fetchQuery`, `getQueryOptions`, or the React query
hooks/factories, use the same `callConfig` when generating or looking up query
keys. The cache key is partitioned by the resolved target canister and, when
present, `effectiveCanisterId`.

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
import type { AgentState } from "@ic-reactor/core"

interface AgentState {
  isInitialized: boolean
  isInitializing: boolean
  error: Error | undefined
  network: string | undefined
  isLocalhost: boolean
}
```

`AuthState` is exported by [`@ic-reactor/react`](../react), not by this package:

```typescript
import type { AuthState } from "@ic-reactor/react"
```

## Advanced Usage

### Multiple Canisters

```typescript
const clientManager = new ClientManager({ queryClient })

// All reactors share the same agent and identity
const backend = new Reactor<Backend>({
  clientManager,
  idlFactory: backendIdl,
  name: "backend",
  canisterId: "...",
})
const ledger = new DisplayReactor<Ledger>({
  clientManager,
  idlFactory: ledgerIdl,
  name: "ledger",
  canisterId: "...",
})
const nft = new Reactor<NFT>({
  clientManager,
  idlFactory: nftIdl,
  name: "nft",
  canisterId: "...",
})

// Sign in once (via @ic-reactor/react) — every reactor picks up the identity
await authentication.login()
```

### Custom Polling Options

`pollingOptions` is the `PollingOptions` type from `@icp-sdk/core/agent`:

```typescript
import { defaultStrategy } from "@icp-sdk/core/agent"

const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId: "...",
  pollingOptions: {
    strategy: defaultStrategy(),
    preSignReadStateRequest: false,
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

For comprehensive guides and API reference, visit the [documentation site](https://ic-reactor.b3pay.net/v3).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)
