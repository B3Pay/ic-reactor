# @ic-reactor/react

**The Ultimate React Hooks for the Internet Computer.**  
Connect your React application to the Internet Computer Blockchain in seconds. using the power of [TanStack Query](https://tanstack.com/query).

## Features

- ⚛️ **React Query Integration**: Full power of TanStack Query (Caching, Refetching, Suspense).
- 🔄 ** Type-Safe**: Full TypeScript support with automatic type inference from your Candid files.
- 🔐 **Authentication**: Easy-to-use authentication hooks with Internet Identity and other providers.
- 🚀 **Performance**: Efficient caching and state management tailored for IC.

## Installation

```bash
npm install @ic-reactor/react @ic-reactor/core @tanstack/react-query @icp-sdk/core @icp-sdk/auth
```

## Quick Start

### 1. Initialize the Actor

Create your actor hooks using `createActorHooks`. This is the "One Stop Shop" for interacting with your canister.

```typescript
// src/hooks/actor.ts
import { createActorHooks } from "@ic-reactor/react"
import { canisterId, idlFactory } from "../declarations/my_canister"

export const { useActorQuery, useActorMutation, useAuth, reactor } =
  createActorHooks({
    canisterId,
    idlFactory,
  })
```

### 2. Authentication (Auto-Initializes Session)

The `useAuth` hook automatically initializes the agent and restores any previous session on first use.

```tsx
// src/App.tsx
import { useAuth } from "./hooks/actor"

function App() {
  // useAuth() auto-initializes - no separate setup needed!
  const { isAuthenticated, login, logout } = useAuth()

  return (
    <div>
      {isAuthenticated ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Login with II</button>
      )}
      <Dashboard />
    </div>
  )
}
```

### 3. Use in Components

Now you can use your hooks directly in your components!

```tsx
// src/Dashboard.tsx
import { useActorQuery, useActorMutation } from "./hooks/actor"

function Dashboard() {
  // Query: Fetch data (auto-cached!)
  const { data: balance } = useActorQuery({
    functionName: "icrc1_balance_of",
    args: [{ owner: Principal.fromText("...") }],
  })

  // Update: Execute state changes
  const { mutate: transfer, isPending } = useActorMutation({
    functionName: "icrc1_transfer",
    onSuccess: () => {
      console.log("Transfer successful!")
    }
  })

  return (
    <div>
      <h1>Balance: {balance?.toString()}</h1>
      <button onClick={() => transfer(...)} disabled={isPending}>
        Transfer
      </button>
    </div>
  )
}
```

### Form Friendly (CandidAdapter)

If you want your hooks to automatically handle type transformations (e.g., converting `bigint` to `string` for simple form binding), set `autoCodecs: true`.

```typescript
export const { useActorQuery } = createActorHooks({
  canisterId,
  idlFactory,
  autoCodecs: true, // Returns stringified values for bigint, principal, small blobs
})
```

### Authentication

The `createActorHooks` function returns authentication hooks directly.

```typescript
import { useAuth } from "./hooks/actor"

function LoginButton() {
  const { login, logout, identity, isAuthenticated } = useAuth()

  return (
    <div>
      {isAuthenticated ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Login</button>
      )}
    </div>
  )
}
```

### Dynamic Queries

Need to create queries on the fly? Use `createQuery`.

```typescript
import { createQuery } from "@ic-reactor/react"

const balanceQuery = createQuery(reactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => balance.toString() + " ICP",
})

const { data } = balanceQuery.useQuery()
```

## License

MIT
