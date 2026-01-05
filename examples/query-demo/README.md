# IC Reactor Demo - Queries & Mutations

This example demonstrates how to use `createActorSuspenseQuery`, `createActorSuspenseQueryFactory`, and `createActorMutation` from `@ic-reactor/react` to create reusable, type-safe query and mutation wrappers for Internet Computer canister calls.

## Quick Start

```bash
# From the monorepo root
pnpm install
pnpm build
cd examples/query-demo
pnpm dev
```

## Key Concepts

### 1. `createActorSuspenseQuery` - Static Queries

Use when arguments are known at definition time:

```typescript
import { createActorSuspenseQuery, DisplayReactor } from "@ic-reactor/react"

// Define query once (no arguments)
const icpNameQuery = createActorSuspenseQuery(icpReactor, {
  functionName: "icrc1_name",
})

// Usage in component (uses useSuspenseQuery internally)
function TokenName() {
  const { data } = icpNameQuery.useQuery()
  return <span>{data}</span>
}

// Usage in loader/router
async function loader() {
  const name = await icpNameQuery.fetch()
  return { name }
}
```

### 2. `createActorSuspenseQueryFactory` - Dynamic Queries

Use when arguments are provided at runtime:

```typescript
import { createActorSuspenseQueryFactory } from "@ic-reactor/react"

// Define factory (args provided later)
const getBalance = createActorSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
})

// Create query with specific args
const balanceQuery = getBalance({ owner: principal, subaccount: null })

// Usage in component
function Balance({ account }) {
  const { data } = getBalance(account).useQuery()
  return <span>{data}</span>
}
```

### 3. `createActorMutation` - Mutations with Auto-Refetch 🔥

Use for state-changing operations like transfers. **The killer feature**: just pass `invalidateQueries` and the library handles everything!

```typescript
import { createActorMutation, createActorSuspenseQueryFactory } from "@ic-reactor/react"

// Define mutation
const icpTransferMutation = createActorMutation(icpReactor, {
  functionName: "icrc1_transfer",
})

// Define balance query factory
const getIcpBalance = createActorSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => formatBalance(balance, "ICP"),
})

// Usage in component - balance auto-updates after transfer!
function TransferForm({ userAccount }) {
  // Get the balance query for this user
  const balanceQuery = getIcpBalance(userAccount)

  // 🔥 Pass invalidateQueries with .getQueryKey() - that's it!
  const { mutate, isPending } = icpTransferMutation.useMutation({
    invalidateQueries: [balanceQuery.getQueryKey()], // Auto-refetch! ✨
  })

  const handleTransfer = () => {
    // DisplayReactor accepts string amounts - no bigint needed!
    mutate([{
      to: { owner: recipientPrincipal, subaccount: null },
      amount: "100000000", // 1 ICP
      fee: null,
      memo: null,
      from_subaccount: null,
      created_at_time: null,
    }])
  }

  return (
    <>
      <span>Balance: {balanceQuery.useQuery().data}</span>
      <button onClick={handleTransfer} disabled={isPending}>
        {isPending ? "Transferring..." : "Transfer"}
      </button>
    </>
  )
}
```

### 4. Authentication with `createAuthHooks`

```typescript
import { createAuthHooks } from "@ic-reactor/react"

export const { useAuth, useAuthState, useUserPrincipal } = createAuthHooks(clientManager)

// Usage in component
function AuthButton() {
  const { login, logout } = useAuth()
  const { isAuthenticated, isAuthenticating } = useAuthState()
  const principal = useUserPrincipal()

  if (isAuthenticated) {
    return (
      <div>
        <span>Logged in as: {principal?.toText()}</span>
        <button onClick={() => logout()}>Logout</button>
      </div>
    )
  }

  return (
    <button onClick={() => login()} disabled={isAuthenticating}>
      {isAuthenticating ? "Connecting..." : "Login with Internet Identity"}
    </button>
  )
}
```

### 5. Select Transformations

Transform data at query time:

```typescript
// Transform at definition
const formattedBalance = createActorSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => `${balance} ICP`,
})

// Chain another select in hook
const { data } = formattedBalance(account).useQuery({
  select: (formatted) => formatted.toUpperCase(),
})
```

## API Reference

### `createActorSuspenseQuery(reactor, config)`

Creates a query wrapper for methods without dynamic arguments.

**Config:**

- `functionName` - The canister method to call
- `args?` - Static arguments (optional)
- `staleTime?` - Cache duration (default: 5 minutes)
- `select?` - Transform function for the result

**Returns:**

- `fetch()` - Fetch data (uses `ensureQueryData`)
- `useQuery(options?)` - React hook (uses `useSuspenseQuery`)
- `refetch()` - Invalidate and refetch
- `getQueryKey()` - Get the query key
- `getCacheData()` - Get data from cache without fetching

### `createActorSuspenseQueryFactory(reactor, config)`

Creates a factory that returns query wrappers when called with arguments.

**Config:** Same as `createActorSuspenseQuery`, but without `args`

**Returns:** A function that accepts args and returns a `ActorSuspenseQueryResult`

### `createActorMutation(reactor, config)`

Creates a mutation wrapper for state-changing operations.

**Config:**

- `functionName` - The canister method to call
- `onSuccess?` - Callback on successful mutation
- `invalidateQueries?` - Query keys to refetch after mutation

**Returns:**

- `useMutation(options?)` - React hook with `mutate`, `isPending`, `error`, `isSuccess`
- `execute(args)` - Direct execution function for loaders/actions

## Benefits

1. **Type-Safe** - Full TypeScript inference for methods, args, and returns
2. **Cacheable** - Uses React Query's caching automatically
3. **Reusable** - Define once, use in loaders and components
4. **Composable** - Chain select transformations
5. **Suspense-Ready** - Works with React Suspense out of the box
6. **Mutation Support** - Full mutation handling with loading/error states

## Important Notes

- `useQuery()` uses `useSuspenseQuery` internally, so wrap components in `<Suspense>`
- The `enabled` option is NOT supported for suspense queries (use `createActorQuery` instead)
- Data is always defined when the component renders
- Use `DisplayReactor` for automatic bigint → string transformations
- Mutations work with Internet Identity authentication out of the box
