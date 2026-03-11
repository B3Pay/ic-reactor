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
- `createAuthHooks(clientManager)` for `useAuth`, `useAuthState`,
  `useAgentState`, and `useUserPrincipal`
- direct reactor hooks like `useReactorQuery` when you want to pass the reactor
  instance at call time
- factory helpers like `createQuery`, `createSuspenseQuery`,
  `createInfiniteQuery`, `createSuspenseInfiniteQuery`, and `createMutation`
  when the same operation must work both inside and outside React

## Choosing the Right Pattern

- Use `createActorHooks` for the simplest component-first integration.
- Use query and mutation factories when you also need loader, action, service,
  or test usage through `.fetch()`, `.execute()`, `.invalidate()`, or
  `.getCacheData()`.
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
})
```

```tsx
const profileQuery = getProfile(["alice"])
const { data } = profileQuery.useSuspenseQuery()

const mutation = updateProfile.useMutation({
  invalidateQueries: [profileQuery.getQueryKey()],
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
