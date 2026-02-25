# @ic-reactor/react

<div align="center">
  <strong>The Ultimate React Hooks for the Internet Computer.</strong>
  <br><br>
  
  [![npm version](https://img.shields.io/npm/v/@ic-reactor/react.svg)](https://www.npmjs.com/package/@ic-reactor/react)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
</div>

---

Connect your React application to the Internet Computer Blockchain with full [TanStack Query](https://tanstack.com/query) integration for caching, suspense, and infinite queries.

## Features

- ⚛️ **TanStack Query Integration** — Full power of React Query (caching, refetching, suspense, infinite queries)
- � **End-to-End Type Safety** — Automatic type inference from your Candid files
- � **Auto Transformations** — `DisplayReactor` converts BigInt to string, Principal to text, and more
- 📦 **Result Unwrapping** — Automatic `Ok`/`Err` handling from Candid Result types
- 🔐 **Authentication** — Easy-to-use hooks with Internet Identity integration
- 🏗️ **Multi-Actor Support** — Manage multiple canisters with shared authentication

## Installation

```bash
# With npm
npm install @ic-reactor/react @tanstack/react-query @icp-sdk/core

# With pnpm
pnpm add @ic-reactor/react @tanstack/react-query @icp-sdk/core

# Optional: For Internet Identity authentication
npm install @icp-sdk/auth
```

## Quick Start

### 1. Setup ClientManager and Reactor

```typescript
// src/reactor.ts
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { idlFactory, type _SERVICE } from "./declarations/my_canister"

// Create query client for caching
export const queryClient = new QueryClient()

// Create client manager (handles identity and agent)
// Create client manager (handles identity and agent)
export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true, // Reads canister IDs from environment/cookies
})

// Create reactor for your canister
export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend", // Required: explicit name for the reactor
})
```

### 2. Create Hooks

```typescript
// src/hooks.ts
import { createActorHooks, createAuthHooks } from "@ic-reactor/react"
import { backend, clientManager } from "./reactor"

// Create actor hooks for queries and mutations
export const { useActorQuery, useActorMutation, useActorSuspenseQuery } =
  createActorHooks(backend)

// Create auth hooks for login/logout
export const { useAuth, useUserPrincipal } = createAuthHooks(clientManager)
```

### 3. Setup Provider (not required) and Use in Components

```tsx
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./reactor"
import { useAuth, useActorQuery, useActorMutation } from "./hooks"

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthButton />
      <Greeting />
    </QueryClientProvider>
  )
}

function AuthButton() {
  const { login, logout, isAuthenticated, principal } = useAuth()

  return isAuthenticated ? (
    <button onClick={() => logout()}>
      Logout {principal?.toText().slice(0, 8)}...
    </button>
  ) : (
    <button onClick={() => login()}>Login with Internet Identity</button>
  )
}

function Greeting() {
  // Query: Fetch data (auto-cached!)
  const { data, isPending, error } = useActorQuery({
    functionName: "greet",
    args: ["World"],
  })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{data}</h1>
}
```

## Core Concepts

### Reactor vs DisplayReactor

| Feature       | `Reactor`        | `DisplayReactor`             |
| ------------- | ---------------- | ---------------------------- |
| Types         | Raw Candid types | Display-friendly types       |
| BigInt        | `bigint`         | `string`                     |
| Principal     | `Principal`      | `string`                     |
| Vec nat8      | `Uint8Array`     | <= 512 bytes: `string` (hex) |
| Result        | Unwrapped        | Unwrapped                    |
| Form-friendly | No               | Yes                          |

```typescript
import { DisplayReactor } from "@ic-reactor/react"

// DisplayReactor for form-friendly UI work
const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})

// Now hooks return strings instead of bigint/Principal
const { data } = useActorQuery({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa", subaccount: [] }], // strings!
})
// data is "100000000" instead of 100000000n
```

## Hooks Reference

### Actor Hooks (from `createActorHooks`)

| Hook                            | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `useActorQuery`                 | Standard queries with loading states           |
| `useActorSuspenseQuery`         | Suspense-enabled queries (data always defined) |
| `useActorInfiniteQuery`         | Paginated/infinite scroll queries              |
| `useActorSuspenseInfiniteQuery` | Suspense infinite queries                      |
| `useActorMutation`              | State-changing operations                      |

### Auth Hooks (from `createAuthHooks`)

| Hook               | Description                         |
| ------------------ | ----------------------------------- |
| `useAuth`          | Login, logout, authentication state |
| `useAgentState`    | Agent initialization state          |
| `useUserPrincipal` | Current user's Principal            |

## Query Examples

### Standard Query

```tsx
const { data, isPending, error } = useActorQuery({
  functionName: "get_user",
  args: ["user-123"],
  staleTime: 5 * 60 * 1000, // 5 minutes
})
```

### Suspense Query

```tsx
// Parent must have <Suspense> boundary
function UserProfile() {
  // data is never undefined with suspense!
  const { data } = useActorSuspenseQuery({
    functionName: "get_user",
    args: ["user-123"],
  })

  return <div>{data.name}</div>
}
```

### Infinite Query

```tsx
const { data, fetchNextPage, hasNextPage } = useActorInfiniteQuery({
  functionName: "get_posts",
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => pages.length * 10,
  args: (pageParam) => [{ offset: pageParam, limit: 10 }],
})
```

`createInfiniteQuery(...)` and `createInfiniteQueryFactory(...)` support standard
TanStack Query infinite-query options at the create level, including
`refetchInterval`, `refetchOnMount`, `refetchOnWindowFocus`, `retry`, and `gcTime`.

## Mutation Examples

### Basic Mutation

```tsx
const { mutate, isPending, error } = useActorMutation({
  functionName: "update_profile",
  onSuccess: (result) => {
    console.log("Profile updated!", result)
  },
})

// Call the mutation
mutate([{ name: "Alice", bio: "Hello IC!" }])
```

## Query Factories

Create reusable query configurations with factory functions:

```typescript
import {
  createQuery,
  createSuspenseQuery,
  createMutation,
} from "@ic-reactor/react"

// Static query (no args at call time)
export const tokenNameQuery = createSuspenseQuery(backend, {
  functionName: "icrc1_name",
})

// In component:
const { data } = tokenNameQuery.useSuspenseQuery()
```

### Factory with Dynamic Args

```typescript
import { createSuspenseQueryFactory } from "@ic-reactor/react"

// Factory for balance queries
export const getBalance = createSuspenseQueryFactory(backend, {
  functionName: "icrc1_balance_of",
  select: (balance) => `${balance} tokens`,
})

// In component - create the query instance with args at call time
const balanceQuery = getBalance([{ owner: userPrincipal, subaccount: [] }])
const { data } = balanceQuery.useSuspenseQuery()
```

### Infinite Query Factory (Route/Search Params Safe)

Use `getKeyArgs` in the factory config to derive a stable logical identity from
the first-page args, and keep pagination cursors inside `getArgs(pageParam)`.
This prevents cache collisions when loaders rerun with different search params.

```tsx
import { createInfiniteQueryFactory } from "@ic-reactor/react"

type TodoSearch = {
  filter: "all" | "active" | "completed"
  q: string
  sort: "newest" | "oldest"
}

export const makeTodoListQuery = createInfiniteQueryFactory(todoReactor, {
  functionName: "list_todos",
  initialPageParam: 0,
  getKeyArgs: (args) => {
    const [request] = args
    return [
      {
        filter: request.filter,
        q: request.q,
        sort: request.sort,
      },
    ]
  },
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

// TanStack Router loader/search-param flow
export async function loader({ context, deps }: any) {
  const search = deps.search as TodoSearch

  const todosQuery = makeTodoListQuery((cursor) => [
    {
      cursor,
      limit: 20,
      filter: search.filter,
      q: search.q,
      sort: search.sort,
    },
  ])

  await todosQuery.fetch()
  return { queryKey: todosQuery.getQueryKey() }
}

function TodosPage({ search }: { search: TodoSearch }) {
  const todosQuery = makeTodoListQuery((cursor) => [
    {
      cursor,
      limit: 20,
      filter: search.filter,
      q: search.q,
      sort: search.sort,
    },
  ])

  const { data, fetchNextPage, hasNextPage } = todosQuery.useInfiniteQuery()
  return null
}
```

## Advanced: Direct Reactor Usage

Access reactor methods directly for manual cache management:

```typescript
// Fetch and cache
await backend.fetchQuery({
  functionName: "get_user",
  args: ["user-123"],
})

// Get cached data (no fetch)
const cached = backend.getQueryData({
  functionName: "get_user",
  args: ["user-123"],
})

// Invalidate cache to trigger refetch
backend.invalidateQueries({
  functionName: "get_user",
})

// Direct call without caching
const result = await backend.callMethod({
  functionName: "update_user",
  args: [{ name: "Alice" }],
})
```

## Re-exports

`@ic-reactor/react` re-exports everything from `@ic-reactor/core`, so you typically only need one import:

```typescript
// Everything from one package
import {
  ClientManager,
  Reactor,
  DisplayReactor,
  createActorHooks,
  createAuthHooks,
  createQuery,
  CanisterError,
} from "@ic-reactor/react"
```

## Documentation

For comprehensive guides and API reference, visit the [documentation site](https://ic-reactor.b3pay.net/v3).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)
