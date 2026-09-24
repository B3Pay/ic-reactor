# @ic-reactor/core

<div align="center">
  <strong>The Core Library for Internet Computer Applications</strong>
  <br><br>

[![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
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

// Initialize the agent (fetches the root key on a local host)
await clientManager.initialize()
```

The network is detected automatically: in the browser from the serving origin,
in Node/SSR from `ICP_NETWORK` / `DFX_NETWORK`. Pass `agentOptions.host` to
override it.

On a local host (`localhost`, a loopback address, or a `*.github.dev` or
`*.gitpod.io` tunnel), `initialize()` fetches the replica's root key even if you
passed `agentOptions.rootKey` or set `shouldFetchRootKey: false`, and the fetched
key replaces yours. Any other host, including a custom testnet domain, is treated
as mainnet: nothing is fetched and a supplied key is kept.

### 2. Create Reactor

The `Reactor` class wraps a canister with type-safe methods and caching:

```typescript
import { Reactor } from "@ic-reactor/core"
import {
  canisterId,
  idlFactory,
  type _SERVICE,
} from "./declarations/my_canister"

const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend", // Required: explicit name
  // Required in Node, where the constructor otherwise throws. A browser page
  // may omit it only when the ic_env cookie is trusted there (a local replica,
  // or `allowEnvConfig: true`); see below.
  canisterId,
})
```

### 3. Call Methods

```typescript
// Direct call (no caching)
const greeting = await backend.callMethod({
  functionName: "greet",
  args: ["World"],
})

// Fetch with caching: cache-first, so a cached value is returned even if
// it is stale or was invalidated
const cachedGreeting = await backend.fetchQuery({
  functionName: "greet",
  args: ["World"],
})

// Get from cache (no network call)
const fromCache = backend.getQueryData({
  functionName: "greet",
  args: ["World"],
})

// Invalidate cache: mounted queries refetch; fetchQuery still returns the
// cached value until one of them has refetched
backend.invalidateQueries({ functionName: "greet" })
```

## ClientManager API

### Constructor Options

```typescript
interface ClientManagerParameters {
  queryClient: QueryClient // TanStack Query client (required)
  agentOptions?: HttpAgentOptions // Custom HttpAgent options (host, identity, rootKey, ...)
  allowEnvConfig?: boolean // Trust the ic_env cookie on this host (default: local replicas only)
  allowEnvRootKey?: boolean // Deprecated alias for allowEnvConfig
}
```

The `ic_env` cookie can carry three things the library would otherwise have to
be told: an `IC_ROOT_KEY`, an Internet Identity provider, and the
`PUBLIC_CANISTER_ID:<name>` entries a reactor resolves when no `canisterId` is
configured. Cookies are not origin-isolated — any sibling subdomain of the
registrable domain can write `ic_env` — so all three are trusted only when the
agent host and the page origin are both unambiguously a local replica: loopback
(all of 127.0.0.0/8), `localhost` and its subdomains, and the dev-container
domains that tunnel one. The page counts because the page is what decides who
the siblings are: a document served from `app.example.com` shares its cookie jar
with every other `*.example.com`, whatever host its agent talks to. The exported
`allowsEnvRootKey(host)` answers this for one host, and `ClientManager` asks it
of both and resolves the pair once into the `trustsEnvConfig` getter that every
consumer reads.

Anything else must opt in with `allowEnvConfig: true`. Without it a reactor
with no configured `canisterId` throws on such a host rather than taking one
from the cookie, because a substituted canister ID is not something certificate
verification can catch: the attacker names a real canister, whose responses
verify against the same mainnet root key.

`allowEnvRootKey` is the former name of this option and still works, but only
for what it always granted — the root key. It does not extend to the identity
provider or the canister ID: setting it for a custom testnet was not an
agreement to take those from a cookie too. Do not use `isMainnetHost`
as a "safe to trust local config" test: it recognises only the three canonical
boundary domain families, so a mainnet dapp on a custom domain falls through
it.

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
clientManager.trustsEnvConfig // boolean — whether the ic_env cookie is trusted here

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
  pollingOptions?: PollingOptions // Update-call polling, shared by every call (see Custom Polling Options)
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

// Get query options for TanStack Query. For an update method they also carry
// a `retry` of only SysTransient rejections (see `getQueryRetry`), since each
// retry executes the update again.
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

The display types are derived from the service type parameter. A
`DisplayReactor` created without one is typed by `BaseActor`, and every
method's display-side args and results are `unknown` (an untyped `Reactor`
gives `any`): pass the service type, or cast to the display shape you expect.

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

`fromZodSchema(schema)` turns a zod schema into a validator for the first
argument. A schema with an async refinement or transform needs
`fromZodSchema(schema, { async: true })`, which parses with `safeParseAsync`
and returns an async validator. Async validators run in `validate()` and
`callMethodWithValidation()`. `callMethod()`, and the React hooks and factories
that call it, run validators synchronously and refuse a call whose validator
returns a promise.

A validator that throws or rejects is reported alike by `callMethod()`,
`callMethodWithValidation()` and `validate()`: as a `CallError` whose `cause` is
what it threw, before anything is sent. A `ValidationError` it throws is passed
on as it is.

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
  details: CanisterErrorDetails<E> // err.details when err has a text code
}
```

`details` is the error value's own `details` field, decoded like the rest of
`err`, and `undefined` when `err` has no text `code`. It is never a `Map`. For
an error record such as Orbit's
`record { code : text; message : opt text; details : opt vec record { text; text } }`
it is `[] | [Array<[string, string]>]` from a `Reactor` and
`Record<string, string> | null | undefined` from a `DisplayReactor`; for a
variant error such as ICRC-1's `TransferError` it is `undefined`.

For an error value with a text `code` (the API shape), `message` is the value's
own `message`: its text, or the text inside an `opt text`, which a `Reactor`
decodes as `[string]` and a `DisplayReactor` as the text itself, so both give
Orbit's `"Account not found"`. Without one (an empty `opt`, say), `message` is
the value written as JSON. For any other error value it is
`"Canister Error: "` followed by the value, written as JSON when it is an
object.

`CanisterError.isApiError(value)` checks only that `value` has `code`,
`message` and `details`. It narrows to `ApiError`, whose `message` and
`details` are `unknown` unless you name them, as decoding decides their types:
`ApiError<[] | [string], [] | [Array<[string, string]>]>` for Orbit's error
through a `Reactor`.

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
`[resolvedCanisterId, functionName, { transform }?, { agent }?, { effectiveTarget }?, argKey?, ...queryKey]`.
The `{ transform }` segment is present whenever the reactor's transform is not
`"candid"`, so the keys above are a `Reactor`'s. A `DisplayReactor` key carries
`{ transform: "display" }`: the first call above returns
`[canisterId, "get_user", { transform: "display" }, '["user-123"]']`, and a
`Reactor` and a `DisplayReactor` over one canister never share a cache entry.
`argKey` is a single string, not the individual arguments: the arguments
serialized as JSON with `bigint` rendered as a decimal string and the keys of
every plain object sorted, so `{ b, a }` and `{ a, b }` give the same key. A
bare `JSON.stringify(args)` does not match it once a record's fields are out of
alphabetical order. A blob is written as a tag followed by its lowercase hex, so
a `Uint8Array`, a `number[]` and a `DisplayReactor`'s hex text holding the same
bytes give the same key. A `DisplayReactor` writes each `opt` and variant in one
form, whichever it was given in, so an `opt` given bare or as `[value]`, none
given as `null`, `undefined` or `[]`, and a variant given with or without
`_type` give the same key. A `vec record { text; T }` given to it as an object
or a `Map` is written as its entries in order, since the order is part of what
it sends. Fields a record
does not declare are left out and every value of `reserved` is written as
`null`, since neither is sent, and a `DisplayReactor` writes a float or an
integer of 32 bits or fewer given as text as its number, and a `Principal` as
its text. An argument the reactor refuses, such as `undefined` where Candid
`null` is required or a bigint where a `DisplayReactor` takes text, is written
behind a tag of its own, so the call fails instead of being answered from the
cache entry of an argument it takes. The
`{ effectiveTarget }` segment is dropped when it names
the same canister the key is already rooted at, and any custom `queryKey` is
appended element-wise. Build keys with `generateQueryKey` (or a query object's
`getQueryKey()`) rather than by hand.

If you pass `callConfig` to `fetchQuery`, `getQueryOptions`, the bound query
hooks (`useActorQuery`, `useActorSuspenseQuery` and the two infinite-query
hooks) or `createInfiniteQuery` / `createSuspenseInfiniteQuery`, use the same
`callConfig` when generating or looking up query keys. `createQuery`,
`createSuspenseQuery` and their `...Factory` variants take no `callConfig`: a
config that carries one fails with TS2353. The cache key is partitioned by the
resolved target canister and, when present, `effectiveCanisterId` and
`callConfig.agent`.

A `callConfig.agent` that is not the `ClientManager`'s own agent adds an
`{ agent: n }` segment after `{ transform }` and before `argKey`, where `n`
numbers that agent within the running process. The same query through that
agent and through the manager's agent are two cache entries, since each is
answered for its own identity or network. Keys without an override are
unchanged, `invalidateQueries({ functionName })` matches both entries, and
`updateAgent()` sweeps both. Each process counts from a random start, so an
override entry in a dehydrated server cache, or in a cache persisted and
restored later, is not found by another process's agents.

Query keys name the canister, not the `ClientManager`. Two `ClientManager`s on
the same canister (two identities, or a local replica and mainnet) must each
get their own `QueryClient`: sharing one, their reactors share cache entries,
and one manager's `updateAgent()` sweeps the other's. `defineReactor` builds a
`QueryClient` per manager by default.

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

`pollingOptions` is the `PollingOptions` type from `@icp-sdk/core/agent`. The
reactor hands the same object to every update call, so a `strategy` set here
polls all of them. `createPollingStrategy` is built to be shared that way: it
keeps a separate attempt count, clock and timeout for each request.

```typescript
import { createPollingStrategy } from "@ic-reactor/core"

const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId: "...",
  pollingOptions: {
    // Give up on a request that is still pending after two minutes
    // (the default is five).
    strategy: createPollingStrategy({ timeoutMs: 120_000 }),
  },
})
```

Leave `strategy` out and the agent builds a fresh `defaultStrategy()` for each
request.

Don't put `defaultStrategy()`, or any other strategy from
`@icp-sdk/core/agent`, in the reactor's `pollingOptions`. Those are made for a
single request: `defaultStrategy()` starts its five-minute timeout when it is
created and keeps one backoff for everything it polls. Five minutes after the
reactor is built, every update call still pending at its first poll fails with
`Request timed out after 300000 msec`. To use one, create it for the call:

```typescript
import { defaultStrategy } from "@icp-sdk/core/agent"

const result = await backend.callMethod({
  functionName: "transfer",
  args: [transferArgs],
  callConfig: { pollingOptions: { strategy: defaultStrategy() } },
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
