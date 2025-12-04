# TanStack Query Integration - README Addition

Add this section to the main README.md to document the new TanStack Query integration:

---

## 🚀 TanStack Query Integration (New!)

The `@ic-reactor/core` package now supports **TanStack Query** for advanced state management with automatic caching, smart refetching, and request deduplication.

### Why TanStack Query?

- ✅ **Automatic Caching** - Query results are cached based on method name and arguments
- ✅ **Request Deduplication** - Multiple identical requests are automatically deduplicated
- ✅ **Smart Refetching** - Automatic background refetching when data becomes stale
- ✅ **Cache Invalidation** - Update methods automatically invalidate related queries
- ✅ **Optimistic Updates** - Built-in support for optimistic UI updates
- ✅ **Backward Compatible** - Existing Zustand-based code continues to work

### Quick Start

```typescript
import { ActorManager } from "@ic-reactor/core"

const actorManager = new ActorManager({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  agentManager,
  withQueryClient: true, // Enable TanStack Query
  queryClientConfig: {
    defaultStaleTime: 30000, // 30 seconds
    defaultGcTime: 300000, // 5 minutes
  },
})

// Query methods are automatically cached
const profile = await actorManager.callMethod("getUserProfile", userId)

// Update methods automatically invalidate cache
await actorManager.callMethod("updateUserProfile", newData)
```

### Advanced Usage

```typescript
import { createQueryClient, actorKeys } from "@ic-reactor/core"

// Create shared QueryClient
const queryClient = createQueryClient({
  defaultStaleTime: 60000,
  retry: 3,
})

// Share across multiple actors
const actor1 = new ActorManager({
  canisterId: "canister-1",
  idlFactory,
  agentManager,
  withQueryClient: true,
  queryClient,
})

// Access QueryClient for advanced operations
const qc = actor1.getQueryClient()

// Manually invalidate queries
await qc?.invalidateQueries({
  queryKey: actorKeys.all(canisterId),
})

// Get cached data
const cachedData = qc?.getQueryData(queryKey)
```

### Configuration Options

```typescript
interface QueryClientConfig {
  defaultStaleTime?: number // Default: 30000 (30 seconds)
  defaultGcTime?: number // Default: 300000 (5 minutes)
  retry?: number // Default: 3
  refetchOnWindowFocus?: boolean // Default: false
}
```

### Migration from Zustand

No breaking changes! Simply add `withQueryClient: true` to enable TanStack Query:

```typescript
// Before (Zustand - still works!)
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
})

// After (TanStack Query - opt-in)
const actorManager = new ActorManager({
  canisterId,
  idlFactory,
  agentManager,
  withQueryClient: true,
})
```

### Learn More

- 📖 [TanStack Query Documentation](https://tanstack.com/query/latest)
- 💻 [Usage Examples](./examples/tanstack-query)
- 🎯 [Migration Guide](./docs/tanstack-query-migration.md)

---

## Additional Documentation Files

The following documentation files have been created in `.agent/artifacts/`:

1. **tanstack-query-summary.md** - Complete summary of changes and features
2. **tanstack-query-usage-guide.md** - Comprehensive usage guide
3. **tanstack-query-examples.ts** - Code examples
4. **tanstack-query-integration-plan.md** - Implementation plan

These files can be moved to appropriate locations in your documentation structure.
