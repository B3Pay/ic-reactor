# TanStack Query Integration Guide

## Overview

The `@ic-reactor/core` package now supports **TanStack Query** as an alternative to Zustand for state management. This integration provides powerful features like automatic caching, smart refetching, request deduplication, and optimistic updates.

## Installation

TanStack Query core is already included as a dependency:

```bash
npm install @ic-reactor/core
# or
yarn add @ic-reactor/core
```

## Basic Usage

### Enabling TanStack Query

To use TanStack Query instead of Zustand, set the `withQueryClient` option to `true`:

```typescript
import { ActorManager, createQueryClient } from "@ic-reactor/core"
import { idlFactory } from "./declarations/backend"

const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true, // Enable TanStack Query
})
```

### Using a Custom QueryClient

You can provide your own QueryClient instance with custom configuration:

```typescript
import { ActorManager, createQueryClient } from "@ic-reactor/core"

const queryClient = createQueryClient({
  defaultStaleTime: 60000, // 1 minute
  defaultGcTime: 300000, // 5 minutes
  retry: 5,
  refetchOnWindowFocus: true,
})

const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient, // Use custom QueryClient
})
```

### Configuring QueryClient Options

Alternatively, pass configuration options and let the ActorManager create the QueryClient:

```typescript
const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClientConfig: {
    defaultStaleTime: 60000,
    defaultGcTime: 300000,
    retry: 3,
  },
})
```

## How It Works

### Query Methods (Read Operations)

When you call a **query method** (read-only canister methods), TanStack Query automatically:

1. **Caches the result** based on the method name and arguments
2. **Deduplicates requests** - multiple calls with same arguments return cached data
3. **Manages stale data** - refetches when data becomes stale
4. **Returns cached data immediately** if available

```typescript
// First call - fetches from canister
const result1 = await actorManager.callMethod("getUserProfile", userId)

// Second call with same args - returns from cache (if not stale)
const result2 = await actorManager.callMethod("getUserProfile", userId)
```

### Update Methods (Write Operations)

When you call an **update method** (write operations), TanStack Query:

1. **Executes the update** on the canister
2. **Invalidates related queries** automatically
3. **Triggers refetch** of affected data

```typescript
// Update user profile
await actorManager.callMethod("updateUserProfile", {
  name: "Alice",
  email: "alice@example.com",
})

// All queries for this actor are invalidated and will refetch
```

## Query Keys

TanStack Query uses query keys to identify and manage cached data. The ActorManager generates keys automatically:

```typescript
// Actor state
['actor', canisterId, 'state']

// Query method calls
['actor', canisterId, 'method', methodName, argsHash]

// All queries for an actor
['actor', canisterId]
```

## Advanced Usage

### Accessing the QueryClient

You can access the underlying QueryClient for advanced operations:

```typescript
const queryClient = actorManager.getQueryClient()

if (queryClient) {
  // Manually invalidate specific queries
  await queryClient.invalidateQueries({
    queryKey: ["actor", canisterId, "method", "getUserProfile"],
  })

  // Get cached data
  const cachedData = queryClient.getQueryData([
    "actor",
    canisterId,
    "method",
    "getUserProfile",
    argsHash,
  ])

  // Set query data manually
  queryClient.setQueryData(
    ["actor", canisterId, "method", "getUserProfile", argsHash],
    newData
  )
}
```

### Sharing QueryClient Across Actors

You can share a single QueryClient instance across multiple ActorManagers:

```typescript
import { createQueryClient } from "@ic-reactor/core"

const sharedQueryClient = createQueryClient()

const actor1 = new ActorManager({
  canisterId: "canister-1",
  idlFactory: idlFactory1,
  agentManager,
  withQueryClient: true,
  queryClient: sharedQueryClient,
})

const actor2 = new ActorManager({
  canisterId: "canister-2",
  idlFactory: idlFactory2,
  agentManager,
  withQueryClient: true,
  queryClient: sharedQueryClient,
})
```

### Manual Cache Invalidation

Invalidate all queries for an actor:

```typescript
const queryClient = actorManager.getQueryClient()

await queryClient?.invalidateQueries({
  queryKey: ["actor", canisterId],
})
```

Invalidate specific method queries:

```typescript
await queryClient?.invalidateQueries({
  queryKey: ["actor", canisterId, "method", "getUserProfile"],
})
```

### Optimistic Updates

For update methods, you can implement optimistic updates:

```typescript
const queryClient = actorManager.getQueryClient()
const queryKey = ["actor", canisterId, "method", "getUserProfile", argsHash]

// Save current data
const previousData = queryClient?.getQueryData(queryKey)

// Optimistically update
queryClient?.setQueryData(queryKey, (old) => ({
  ...old,
  name: "New Name",
}))

try {
  // Perform the actual update
  await actorManager.callMethod("updateUserProfile", { name: "New Name" })
} catch (error) {
  // Rollback on error
  queryClient?.setQueryData(queryKey, previousData)
}
```

## Configuration Options

### QueryClientConfig

```typescript
interface QueryClientConfig {
  /**
   * Default stale time for queries in milliseconds
   * @default 30000 (30 seconds)
   */
  defaultStaleTime?: number

  /**
   * Default garbage collection time in milliseconds
   * @default 300000 (5 minutes)
   */
  defaultGcTime?: number

  /**
   * Enable devtools integration
   * @default false
   */
  withDevtools?: boolean

  /**
   * Number of retry attempts for failed queries
   * @default 3
   */
  retry?: number

  /**
   * Refetch on window focus
   * @default false
   */
  refetchOnWindowFocus?: boolean
}
```

## Migration from Zustand

If you're currently using Zustand (the default), migrating to TanStack Query is straightforward:

### Before (Zustand)

```typescript
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withDevtools: true,
})

// Subscribe to state changes
actorManager.subscribeActorState((state) => {
  console.log("State changed:", state)
})
```

### After (TanStack Query)

```typescript
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClientConfig: {
    defaultStaleTime: 30000,
  },
})

// Subscribe to state changes (still works!)
actorManager.subscribeActorState((state) => {
  console.log("State changed:", state)
})

// Access QueryClient for advanced features
const queryClient = actorManager.getQueryClient()
```

## Best Practices

1. **Share QueryClient**: Use a single QueryClient instance across your application
2. **Configure Stale Time**: Set appropriate stale times based on your data freshness requirements
3. **Use Query Keys**: Leverage the query key structure for targeted invalidation
4. **Handle Errors**: Implement proper error handling for failed queries
5. **Cleanup**: Call `actorManager.cleanup()` when done to clear cache and subscriptions

## Benefits Over Zustand

| Feature | Zustand | TanStack Query |
|---------|---------|----------------|
| Automatic Caching | ❌ | ✅ |
| Request Deduplication | ❌ | ✅ |
| Smart Refetching | ❌ | ✅ |
| Stale Data Management | ❌ | ✅ |
| Background Refetching | ❌ | ✅ |
| Optimistic Updates | Manual | Built-in |
| Cache Invalidation | Manual | Automatic |
| Devtools | Basic | Advanced |

## Example: Complete Integration

```typescript
import { ActorManager, createQueryClient, actorKeys } from "@ic-reactor/core"
import { idlFactory } from "./declarations/backend"

// Create shared QueryClient
const queryClient = createQueryClient({
  defaultStaleTime: 60000, // 1 minute
  defaultGcTime: 300000, // 5 minutes
})

// Create ActorManager with TanStack Query
const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient,
})

// Query method - automatically cached
async function getUserProfile(userId: string) {
  return await actorManager.callMethod("getUserProfile", userId)
}

// Update method - automatically invalidates cache
async function updateUserProfile(data: UserProfile) {
  await actorManager.callMethod("updateUserProfile", data)
  // All related queries are automatically invalidated
}

// Manual cache operations
function invalidateUserProfile(userId: string) {
  const argsHash = generateRequestHash([userId])
  queryClient.invalidateQueries({
    queryKey: actorKeys.method(actorManager.canisterId, "getUserProfile", argsHash),
  })
}

// Cleanup when done
actorManager.cleanup()
```

## Troubleshooting

### Queries Not Updating

If your queries aren't updating after mutations, ensure:

1. You're using `withQueryClient: true`
2. Update methods are properly marked in your IDL
3. Cache invalidation is happening (check with devtools)

### Stale Data

If you're seeing stale data:

1. Adjust `defaultStaleTime` to a lower value
2. Manually invalidate queries after updates
3. Use `refetchOnWindowFocus: true` for critical data

### Memory Leaks

Always call `actorManager.cleanup()` when unmounting components or destroying instances to prevent memory leaks.

## Next Steps

- Explore [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview) for advanced patterns
- Check out the [examples](../../examples) directory for complete implementations
- Read about [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) for better cache management
