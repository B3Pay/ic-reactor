# TanStack Query Integration - Summary

## What Was Done

Successfully integrated **TanStack Query Core** into the `@ic-reactor/core` package as an alternative to Zustand for state management. This integration provides powerful caching, invalidation, and query management capabilities while maintaining backward compatibility.

## Changes Made

### 1. Dependencies
- ✅ Added `@tanstack/query-core@^5.59.20` to `package.json`
- ✅ Installed successfully using yarn workspace

### 2. New Files Created

#### `/packages/core/src/classes/query/index.ts`
- `createQueryClient()` - Factory function for creating QueryClient instances
- `actorKeys` - Query key factory for actor-related queries
- `agentKeys` - Query key factory for agent-related queries
- `QueryClientConfig` interface for configuration

#### Documentation & Examples
- `.agent/artifacts/tanstack-query-integration-plan.md` - Implementation plan
- `.agent/artifacts/tanstack-query-usage-guide.md` - Comprehensive usage guide
- `.agent/artifacts/tanstack-query-examples.ts` - Code examples

### 3. Modified Files

#### `/packages/core/src/classes/actor/types.ts`
- Added `QueryClient` and `QueryClientConfig` imports
- Extended `ActorManagerParameters` with:
  - `withQueryClient?: boolean` - Enable TanStack Query
  - `queryClient?: QueryClient` - Custom QueryClient instance
  - `queryClientConfig?: QueryClientConfig` - QueryClient configuration

#### `/packages/core/src/classes/actor/index.ts`
- Refactored `ActorManager` to support both Zustand and TanStack Query
- Added private `_useQueryClient` and `_queryClient` properties
- Updated `updateState()` to work with both state management systems
- Updated `updateMethodState()` to work with both systems
- Modified `callMethod()` to:
  - Use `queryClient.fetchQuery()` for query methods (with caching)
  - Use direct calls for update methods
  - Automatically invalidate cache after update methods
- Updated `getState()`, `setState()`, and `subscribeActorState()` to support both systems
- Added `getQueryClient()` method to access the QueryClient instance
- Enhanced `cleanup()` to clear query cache

#### `/packages/core/src/classes/index.ts`
- Added `export * from "./query"` to expose query utilities

### 4. Type Safety
- ✅ Fixed all TypeScript errors
- ✅ Added explicit type annotations for QueryClient events
- ✅ Properly typed store creation with generics

## Key Features

### 1. Automatic Caching
Query methods are automatically cached based on method name and arguments:
```typescript
// First call - fetches from canister
await actorManager.callMethod("getUserProfile", "user-123")

// Second call - returns from cache (if not stale)
await actorManager.callMethod("getUserProfile", "user-123")
```

### 2. Smart Invalidation
Update methods automatically invalidate related queries:
```typescript
// This will invalidate all cached queries for this actor
await actorManager.callMethod("updateUserProfile", userData)
```

### 3. Request Deduplication
Multiple simultaneous requests with the same parameters are deduplicated.

### 4. Configurable Stale Time
Control when data is considered stale:
```typescript
const actorManager = new ActorManager({
  withQueryClient: true,
  queryClientConfig: {
    defaultStaleTime: 60000, // 1 minute
  },
})
```

### 5. Backward Compatibility
Existing code using Zustand continues to work without changes:
```typescript
// Still works!
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withDevtools: true, // Uses Zustand
})
```

## Usage Patterns

### Basic Usage
```typescript
import { ActorManager } from "@ic-reactor/core"

const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true, // Enable TanStack Query
})
```

### Custom Configuration
```typescript
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClientConfig: {
    defaultStaleTime: 30000,
    defaultGcTime: 300000,
    retry: 3,
  },
})
```

### Shared QueryClient
```typescript
import { createQueryClient } from "@ic-reactor/core"

const queryClient = createQueryClient()

const actor1 = new ActorManager({
  canisterId: "canister-1",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient, // Share across actors
})
```

### Advanced Cache Operations
```typescript
const queryClient = actorManager.getQueryClient()

// Invalidate specific queries
await queryClient?.invalidateQueries({
  queryKey: ["actor", canisterId, "method", "getUserProfile"],
})

// Get cached data
const data = queryClient?.getQueryData(queryKey)

// Set cached data
queryClient?.setQueryData(queryKey, newData)
```

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
| Query Keys | ❌ | ✅ |

## Query Key Structure

```typescript
// Actor state
['actor', canisterId, 'state']

// Query method calls
['actor', canisterId, 'method', methodName, argsHash]

// All methods for a specific method name
['actor', canisterId, 'method', methodName]

// All queries for an actor
['actor', canisterId]
```

## Migration Guide

### From Zustand to TanStack Query

**Before:**
```typescript
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withDevtools: true,
})
```

**After:**
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
```

The API remains the same - only the underlying state management changes!

## Testing

All type errors have been resolved:
- ✅ QueryClient types properly imported
- ✅ Store creation properly typed
- ✅ Event handlers properly typed
- ✅ No implicit any types

## Next Steps for Users

1. **Try it out**: Enable `withQueryClient: true` in your ActorManager
2. **Configure**: Adjust `defaultStaleTime` and other options for your use case
3. **Monitor**: Use TanStack Query devtools to observe caching behavior
4. **Optimize**: Leverage query keys for targeted cache invalidation
5. **Advanced**: Implement optimistic updates for better UX

## Documentation

- 📖 **Usage Guide**: `.agent/artifacts/tanstack-query-usage-guide.md`
- 💻 **Code Examples**: `.agent/artifacts/tanstack-query-examples.ts`
- 📋 **Implementation Plan**: `.agent/artifacts/tanstack-query-integration-plan.md`

## Breaking Changes

None! The integration is fully backward compatible. Existing code using Zustand will continue to work without any changes.

## Performance Considerations

- **Memory**: QueryClient maintains a cache, but with configurable GC time
- **Network**: Request deduplication reduces unnecessary canister calls
- **Stale Time**: Configure based on your data freshness requirements
- **Cleanup**: Always call `actorManager.cleanup()` to prevent memory leaks

## Future Enhancements

Potential future improvements:
1. Per-method stale time configuration
2. Persistent cache (localStorage/IndexedDB)
3. Retry strategies per method type
4. Background refetch intervals
5. Integration with React Query devtools
6. Mutation tracking and history

## Conclusion

The TanStack Query integration provides a powerful, modern state management solution for IC Reactor while maintaining full backward compatibility with existing Zustand-based code. Users can now leverage advanced caching, automatic invalidation, and smart refetching to build more efficient and responsive Internet Computer applications.
