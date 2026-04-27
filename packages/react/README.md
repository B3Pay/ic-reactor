# @ic-reactor/react

React bindings for IC Reactor. This package re-exports everything from
`@ic-reactor/core` and adds hook factories, auth hooks, direct reactor hooks,
and reusable query or mutation factories built around TanStack Query.

## Install

```bash
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query

# Optional: Internet Identity login helpers
pnpm add @icp-sdk/auth
```

## Quick Start

```tsx
// src/reactor.ts
import { ClientManager, Reactor, createActorHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true,
})

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
})

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorMethod,
} = createActorHooks(backend)
```

```tsx
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient, useActorMethod, useActorQuery } from "./reactor"

function Greeting() {
  const { data, isPending } = useActorQuery({
    functionName: "greet",
    args: ["World"],
  })

  if (isPending) return <p>Loading...</p>
  return <p>{data}</p>
}

function Increment() {
  const { call, isPending } = useActorMethod({ functionName: "increment" })

  return (
    <button disabled={isPending} onClick={() => call([])}>
      {isPending ? "Updating..." : "Increment"}
    </button>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Greeting />
      <Increment />
    </QueryClientProvider>
  )
}
```

## Main APIs

- `createActorHooks(reactor)` for per-canister hooks like `useActorQuery` and
  `useActorMutation`
- `createAuthHooks(clientManager)` for `useAuth`, `useAgentState`, and
  `useUserPrincipal`
- direct reactor hooks like `useReactorQuery` when you want to pass the reactor
  instance at call time
- factory helpers like `createQuery`, `createSuspenseQuery`,
  `createInfiniteQuery`, `createSuspenseInfiniteQuery`, and `createMutation`
  when the same operation must work both inside and outside React

## Choosing the Right Pattern

- Use `createActorHooks` for the simplest component-first integration.
- Use query and mutation factories when you also need loader, action, service,
  or test usage through `.fetch()`, `.prefetch()`, `.execute()`, `.invalidate()`,
  `.getCacheData()`, or `.setData()`.
- Use `DisplayReactor` when you want UI-friendly values such as strings instead
  of `bigint` or `Principal`.
- Use generated hooks from `@ic-reactor/vite-plugin` or `@ic-reactor/cli` when
  you have larger canisters or frequent `.did` changes.

## Factory Example

```ts
import { createSuspenseQueryFactory, createMutation } from "@ic-reactor/react"
import { backend } from "./reactor"

export const getProfile = createSuspenseQueryFactory(backend, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backend, {
  functionName: "update_profile",
  onCanisterError: (err) => console.error("Canister Err variant:", err.code),
})
```

```tsx
const profileQuery = getProfile(["alice"])

// React component
const { data } = profileQuery.useSuspenseQuery()

// Prefetch before navigating (fire-and-forget)
profileQuery.prefetch()

// Optimistic update
profileQuery.setData({ id: "alice", name: "Alice" })

// Mutation with cache invalidation
const mutation = updateProfile.useMutation({
  invalidateQueries: [profileQuery.getQueryKey()],
})
```

## Query Result Methods

Every object returned by `createQuery`, `createSuspenseQuery`, and their
factory variants exposes:

| Method                              | Description                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `fetch()`                           | Cache-first fetch — returns data, populates cache. Use in route loaders.                        |
| `prefetch()`                        | Fire-and-forget cache warm-up. Use on hover or before navigation.                               |
| `invalidate()`                      | Invalidates the cache entry (triggers refetch if query is mounted).                             |
| `getQueryKey()`                     | Returns the TanStack Query key for this query.                                                  |
| `getCacheData(select?)`             | Read directly from cache without fetching. Returns `undefined` if not cached.                   |
| `setData(updater)`                  | Write raw data into the cache. Accepts a value or updater function. Use for optimistic updates. |
| `useQuery()` / `useSuspenseQuery()` | React hook for the query.                                                                       |

## Canister Error Handling

Canister methods can return `Result { Err: E }` variants. These are surfaced
as `CanisterError` and can be handled separately from network or agent errors
via `onCanisterError`. This callback is supported on both `createMutation` and
the direct `useActorMutation` hook:

```tsx
// Via createActorHooks
const { mutate } = useActorMutation({
  functionName: "transfer",
  onCanisterError: (err, vars) => {
    // err.code — the Err variant key (e.g. "InsufficientFunds")
    // err.err  — the typed Err value
    console.error(`Transfer failed: ${err.code}`, vars)
  },
  onError: (err) => {
    // Fires for ALL errors: canister Err variants, network failures, etc.
    console.error("Unexpected error", err)
  },
})

// Via createMutation factory
const transferMutation = createMutation(backend, {
  functionName: "transfer",
  onCanisterError: (err) => toast.error(`${err.code}`),
})
```

## Re-exports

`@ic-reactor/react` re-exports the core runtime, so you can import these from a
single package:

- `ClientManager`
- `Reactor`
- `DisplayReactor`
- `CallError`
- `CanisterError`
- `ValidationError`

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/react
- `@ic-reactor/core`: ../core/README.md
- `@ic-reactor/vite-plugin`: ../vite-plugin/README.md
- `@ic-reactor/cli`: ../cli/README.md
