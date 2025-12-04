# TanStack Query Quick Reference

## Installation

Already included in `@ic-reactor/core` - no additional installation needed!

## Basic Setup

```typescript
import { ActorManager } from "@ic-reactor/core"

const actorManager = new ActorManager({
  canisterId: "your-canister-id",
  idlFactory,
  agentManager,
  withQueryClient: true, // Enable TanStack Query
})
```

## Configuration Options

```typescript
queryClientConfig: {
  defaultStaleTime: 30000,      // 30 seconds
  defaultGcTime: 300000,         // 5 minutes
  retry: 3,                      // Retry failed queries 3 times
  refetchOnWindowFocus: false,   // Don't refetch on window focus
}
```

## Query Keys

```typescript
import { actorKeys } from "@ic-reactor/core"

// All queries for an actor
actorKeys.all(canisterId)
// ['actor', canisterId]

// Actor state
actorKeys.state(canisterId)
// ['actor', canisterId, 'state']

// Specific method call
actorKeys.method(canisterId, methodName, argsHash)
// ['actor', canisterId, 'method', methodName, argsHash]

// All calls to a method
actorKeys.methodAll(canisterId, methodName)
// ['actor', canisterId, 'method', methodName]
```

## Common Operations

### Call a Method (Automatic Caching)

```typescript
// Query methods are cached automatically
const result = await actorManager.callMethod("getUserProfile", userId)
```

### Invalidate Cache

```typescript
const queryClient = actorManager.getQueryClient()

// Invalidate all queries for this actor
await queryClient?.invalidateQueries({
  queryKey: actorKeys.all(canisterId),
})

// Invalidate specific method
await queryClient?.invalidateQueries({
  queryKey: actorKeys.methodAll(canisterId, "getUserProfile"),
})
```

### Get Cached Data

```typescript
const queryClient = actorManager.getQueryClient()
const queryKey = actorKeys.method(canisterId, methodName, argsHash)

const cachedData = queryClient?.getQueryData(queryKey)
```

### Set Cached Data

```typescript
queryClient?.setQueryData(queryKey, newData)
```

### Optimistic Update

```typescript
const queryClient = actorManager.getQueryClient()
const queryKey = actorKeys.method(canisterId, methodName, argsHash)

// Save previous data
const previousData = queryClient?.getQueryData(queryKey)

// Update optimistically
queryClient?.setQueryData(queryKey, optimisticData)

try {
  await actorManager.callMethod("updateMethod", data)
} catch (error) {
  // Rollback on error
  queryClient?.setQueryData(queryKey, previousData)
}
```

### Subscribe to Changes

```typescript
// Subscribe to actor state
const unsubscribe = actorManager.subscribeActorState((state) => {
  console.log("State changed:", state)
})

// Subscribe to query cache
const queryClient = actorManager.getQueryClient()
const unsubscribeCache = queryClient?.getQueryCache().subscribe((event) => {
  console.log("Cache event:", event)
})

// Cleanup
unsubscribe()
unsubscribeCache?.()
```

### Shared QueryClient

```typescript
import { createQueryClient } from "@ic-reactor/core"

const sharedClient = createQueryClient({
  defaultStaleTime: 60000,
})

const actor1 = new ActorManager({
  canisterId: "canister-1",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient: sharedClient,
})

const actor2 = new ActorManager({
  canisterId: "canister-2",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient: sharedClient,
})
```

## Cleanup

```typescript
// Always cleanup when done
actorManager.cleanup()
```

## Query vs Update Methods

### Query Methods (Read-Only)
- Automatically cached
- Returns cached data if available and not stale
- Marked with `["query"]` in IDL

```typescript
getUserProfile: IDL.Func([IDL.Text], [UserProfile], ["query"])
```

### Update Methods (Write Operations)
- Not cached
- Automatically invalidates related queries after execution
- No `["query"]` annotation in IDL

```typescript
updateUserProfile: IDL.Func([UserProfile], [IDL.Bool], [])
```

## Stale Time Guidelines

| Data Type | Recommended Stale Time |
|-----------|------------------------|
| User profiles | 60000 (1 minute) |
| Static content | 300000 (5 minutes) |
| Real-time data | 5000 (5 seconds) |
| Rarely changing | 600000 (10 minutes) |
| Frequently changing | 10000 (10 seconds) |

## Common Patterns

### Pattern 1: Fetch with Fallback

```typescript
const queryClient = actorManager.getQueryClient()
const queryKey = actorKeys.method(canisterId, methodName, argsHash)

// Try to get from cache first
let data = queryClient?.getQueryData(queryKey)

if (!data) {
  // Fetch if not in cache
  data = await actorManager.callMethod(methodName, ...args)
}
```

### Pattern 2: Prefetch Data

```typescript
const queryClient = actorManager.getQueryClient()

// Prefetch data before it's needed
await queryClient?.prefetchQuery({
  queryKey: actorKeys.method(canisterId, "getUserProfile", argsHash),
  queryFn: () => actorManager.callMethod("getUserProfile", userId),
})
```

### Pattern 3: Conditional Invalidation

```typescript
// Only invalidate if update was successful
const success = await actorManager.callMethod("updateUserProfile", data)

if (success) {
  await queryClient?.invalidateQueries({
    queryKey: actorKeys.methodAll(canisterId, "getUserProfile"),
  })
}
```

### Pattern 4: Batch Invalidation

```typescript
// Invalidate multiple query types at once
await Promise.all([
  queryClient?.invalidateQueries({
    queryKey: actorKeys.methodAll(canisterId, "getUserProfile"),
  }),
  queryClient?.invalidateQueries({
    queryKey: actorKeys.methodAll(canisterId, "getUserSettings"),
  }),
])
```

## Debugging

### Check if Fetching

```typescript
const queryClient = actorManager.getQueryClient()
const isFetching = queryClient?.isFetching()
console.log("Currently fetching:", isFetching)
```

### Inspect Query State

```typescript
const queryState = queryClient?.getQueryState(queryKey)
console.log("Query state:", queryState)
```

### Clear All Cache

```typescript
queryClient?.clear()
```

### Remove Specific Queries

```typescript
queryClient?.removeQueries({
  queryKey: actorKeys.all(canisterId),
})
```

## Error Handling

```typescript
try {
  const result = await actorManager.callMethod("getUserProfile", userId)
} catch (error) {
  console.error("Query failed:", error)
  
  // Query will automatically retry based on retry config
  // Default: 3 retries
}
```

## TypeScript Tips

```typescript
// Type the query data
const data = queryClient?.getQueryData<UserProfile>(queryKey)

// Type the optimistic update
queryClient?.setQueryData<UserProfile>(queryKey, (old) => ({
  ...old,
  name: "New Name",
}))
```

## Migration Checklist

- [ ] Add `withQueryClient: true` to ActorManager config
- [ ] Configure `defaultStaleTime` based on data freshness needs
- [ ] Remove manual `updateMethodState` calls (now automatic)
- [ ] Replace manual cache invalidation with TanStack Query APIs
- [ ] Update subscriptions to use query cache events (optional)
- [ ] Test caching behavior with different stale times
- [ ] Add cleanup calls where needed
- [ ] Update documentation for your team

## Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Query Keys Guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [Caching Guide](https://tanstack.com/query/latest/docs/framework/react/guides/caching)
- [Invalidation Guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)

---

**Remember:** TanStack Query is opt-in. Your existing Zustand code continues to work without any changes!
