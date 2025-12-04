# TanStack Query Integration Plan for ic-reactor

## Overview
Replace Zustand state management with TanStack Query core to leverage powerful caching, invalidation, and query management features.

## Benefits
1. **Built-in Caching**: Automatic query result caching with configurable stale times
2. **Smart Refetching**: Automatic background refetching and cache invalidation
3. **Request Deduplication**: Multiple components requesting same data get deduplicated
4. **Optimistic Updates**: Built-in support for optimistic UI updates
5. **Devtools**: Better debugging with TanStack Query devtools
6. **Pagination & Infinite Queries**: Native support for complex data fetching patterns
7. **Framework Agnostic**: Core package works across React, Vue, Solid, etc.

## Architecture Changes

### Current State (Zustand)
```
ActorManager
  ├── actorStore (Zustand)
  │   ├── initialized
  │   ├── initializing
  │   ├── error
  │   └── methodState (per-method state)
  └── Manual state updates via setState
```

### New State (TanStack Query)
```
ActorManager
  ├── queryClient (TanStack Query)
  │   ├── Actor initialization query
  │   └── Method queries (per-method with hash-based keys)
  └── Automatic cache management
```

## Implementation Steps

### 1. Add Dependencies
- Add `@tanstack/query-core` to package.json
- Remove or keep Zustand as optional (for backward compatibility)

### 2. Create Query Client Wrapper
- Create `src/classes/query/index.ts`
- Initialize QueryClient with sensible defaults
- Export query client instance and utilities

### 3. Update Actor Types
- Modify `ActorState` to work with TanStack Query
- Create query key factories for actor methods
- Define query options types

### 4. Refactor ActorManager
- Replace `actorStore` with `queryClient`
- Convert `initializeActor` to a query
- Convert method calls to mutations/queries based on type
- Implement query key generation based on method name + args hash

### 5. Query Key Structure
```typescript
// Actor initialization
['actor', canisterId, 'init']

// Method calls (query type)
['actor', canisterId, 'method', methodName, argsHash]

// Method calls (update type)
['actor', canisterId, 'mutation', methodName, argsHash]
```

### 6. State Access Patterns
- Replace `actorStore.getState()` with `queryClient.getQueryData()`
- Replace `actorStore.setState()` with `queryClient.setQueryData()`
- Replace `actorStore.subscribe()` with `queryClient.getQueryCache().subscribe()`

### 7. Method State Management
- Query methods: Use `queryClient.fetchQuery()` with caching
- Update methods: Use `queryClient.fetchQuery()` or custom mutation handling
- Automatic invalidation on updates

### 8. Migration Strategy
- Keep backward compatibility by maintaining similar API surface
- Provide migration guide for consumers
- Add feature flags to enable/disable TanStack Query

## Detailed Implementation

### Query Client Configuration
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
})
```

### Query Key Factory
```typescript
export const actorKeys = {
  all: (canisterId: string) => ['actor', canisterId] as const,
  init: (canisterId: string) => [...actorKeys.all(canisterId), 'init'] as const,
  method: (canisterId: string, methodName: string, argsHash: string) => 
    [...actorKeys.all(canisterId), 'method', methodName, argsHash] as const,
  mutation: (canisterId: string, methodName: string, argsHash: string) => 
    [...actorKeys.all(canisterId), 'mutation', methodName, argsHash] as const,
}
```

### Method Call Pattern
```typescript
// Query method (read)
public callMethod = async <M extends FunctionName<A>>(
  functionName: M,
  ...args: ActorMethodParameters<A[M]>
): Promise<ActorMethodReturnType<A[M]>> => {
  const argsHash = generateRequestHash(args)
  const queryKey = actorKeys.method(this.canisterId, functionName, argsHash)
  
  const isQueryMethod = this.methodAttributes[functionName].type === 'query'
  
  if (isQueryMethod) {
    return this.queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const method = this._getActorMethod(functionName)
        return await method(...args)
      },
      staleTime: 30000, // Configurable per method
    })
  } else {
    // Update method - fetch without caching or use mutation
    const method = this._getActorMethod(functionName)
    const result = await method(...args)
    
    // Invalidate related queries
    await this.queryClient.invalidateQueries({
      queryKey: actorKeys.all(this.canisterId)
    })
    
    return result
  }
}
```

## Breaking Changes
- `actorStore` API will change
- Subscription patterns will differ
- State structure will be managed by TanStack Query

## Backward Compatibility Options
1. Keep Zustand as fallback with feature flag
2. Provide adapter layer that mimics old API
3. Version bump to indicate breaking change

## Testing Strategy
1. Unit tests for query key generation
2. Integration tests for method calls
3. Cache invalidation tests
4. Migration tests from Zustand to TanStack Query

## Documentation Updates
- Update README with TanStack Query usage
- Add migration guide
- Document query key patterns
- Add examples for common patterns

## Timeline
1. Phase 1: Setup and configuration (1-2 days)
2. Phase 2: Core refactoring (2-3 days)
3. Phase 3: Testing and validation (1-2 days)
4. Phase 4: Documentation (1 day)

## Open Questions
1. Should we maintain Zustand for backward compatibility?
2. What should be the default staleTime for different method types?
3. Should mutations be tracked separately or just invalidate queries?
4. How to handle optimistic updates for update methods?
