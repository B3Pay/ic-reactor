/**
 * Example: Using TanStack Query with IC Reactor
 * 
 * This example demonstrates how to use TanStack Query for state management
 * in the IC Reactor ActorManager.
 */

import { ActorManager, createQueryClient, actorKeys } from "@ic-reactor/core"
import { AgentManager } from "@ic-reactor/core"

// Example IDL Factory (replace with your actual IDL)
const idlFactory = ({ IDL }: any) => {
  const UserProfile = IDL.Record({
    id: IDL.Text,
    name: IDL.Text,
    email: IDL.Text,
    createdAt: IDL.Nat64,
  })

  return IDL.Service({
    // Query methods (read-only)
    getUserProfile: IDL.Func([IDL.Text], [IDL.Opt(UserProfile)], ["query"]),
    listUsers: IDL.Func([], [IDL.Vec(UserProfile)], ["query"]),
    
    // Update methods (write operations)
    createUser: IDL.Func([UserProfile], [IDL.Text], []),
    updateUserProfile: IDL.Func([UserProfile], [IDL.Bool], []),
    deleteUser: IDL.Func([IDL.Text], [IDL.Bool], []),
  })
}

// Define types
interface UserProfile {
  id: string
  name: string
  email: string
  createdAt: bigint
}

type BackendActor = {
  getUserProfile: (id: string) => Promise<[UserProfile] | []>
  listUsers: () => Promise<UserProfile[]>
  createUser: (profile: UserProfile) => Promise<string>
  updateUserProfile: (profile: UserProfile) => Promise<boolean>
  deleteUser: (id: string) => Promise<boolean>
}

/**
 * Example 1: Basic Setup with TanStack Query
 */
async function basicExample() {
  // Create AgentManager
  const agentManager = new AgentManager()

  // Create ActorManager with TanStack Query enabled
  const actorManager = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withQueryClient: true,
    queryClientConfig: {
      defaultStaleTime: 30000, // 30 seconds
      defaultGcTime: 300000, // 5 minutes
      retry: 3,
    },
  })

  // Wait for initialization
  await actorManager.initialize()

  // Query method - automatically cached
  const userProfile = await actorManager.callMethod("getUserProfile", "user-123")
  console.log("User profile:", userProfile)

  // Second call with same args - returns from cache if not stale
  const cachedProfile = await actorManager.callMethod("getUserProfile", "user-123")
  console.log("Cached profile:", cachedProfile)

  // Update method - invalidates cache automatically
  await actorManager.callMethod("updateUserProfile", {
    id: "user-123",
    name: "Alice Updated",
    email: "alice@example.com",
    createdAt: BigInt(Date.now()),
  })

  // Cleanup
  actorManager.cleanup()
}

/**
 * Example 2: Shared QueryClient Across Multiple Actors
 */
async function sharedQueryClientExample() {
  const agentManager = new AgentManager()

  // Create a shared QueryClient
  const sharedQueryClient = createQueryClient({
    defaultStaleTime: 60000, // 1 minute
    retry: 5,
  })

  // Create multiple actors sharing the same QueryClient
  const userActor = new ActorManager<BackendActor>({
    canisterId: "user-canister-id",
    idlFactory,
    agentManager,
    withQueryClient: true,
    queryClient: sharedQueryClient,
  })

  const adminActor = new ActorManager<BackendActor>({
    canisterId: "admin-canister-id",
    idlFactory,
    agentManager,
    withQueryClient: true,
    queryClient: sharedQueryClient,
  })

  // Both actors share the same cache
  await userActor.callMethod("listUsers")
  await adminActor.callMethod("listUsers")

  // Cleanup
  userActor.cleanup()
  adminActor.cleanup()
}

/**
 * Example 3: Manual Cache Management
 */
async function manualCacheManagementExample() {
  const agentManager = new AgentManager()

  const actorManager = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withQueryClient: true,
  })

  const queryClient = actorManager.getQueryClient()

  if (!queryClient) {
    throw new Error("QueryClient not available")
  }

  // Fetch user profile
  const userId = "user-123"
  await actorManager.callMethod("getUserProfile", userId)

  // Get cached data
  const argsHash = "0x..." // You would generate this properly
  const cachedData = queryClient.getQueryData(
    actorKeys.method(actorManager.canisterId, "getUserProfile", argsHash)
  )
  console.log("Cached data:", cachedData)

  // Manually invalidate specific queries
  await queryClient.invalidateQueries({
    queryKey: actorKeys.methodAll(actorManager.canisterId, "getUserProfile"),
  })

  // Invalidate all queries for this actor
  await queryClient.invalidateQueries({
    queryKey: actorKeys.all(actorManager.canisterId),
  })

  // Clear all cache for this actor
  queryClient.removeQueries({
    queryKey: actorKeys.all(actorManager.canisterId),
  })

  actorManager.cleanup()
}

/**
 * Example 4: Optimistic Updates
 */
async function optimisticUpdatesExample() {
  const agentManager = new AgentManager()

  const actorManager = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withQueryClient: true,
  })

  const queryClient = actorManager.getQueryClient()

  if (!queryClient) {
    throw new Error("QueryClient not available")
  }

  const userId = "user-123"
  const argsHash = "0x..." // Generate properly
  const queryKey = actorKeys.method(
    actorManager.canisterId,
    "getUserProfile",
    argsHash
  )

  // Get current data
  const previousData = queryClient.getQueryData<[UserProfile] | []>(queryKey)

  // Optimistically update the UI
  queryClient.setQueryData<[UserProfile] | []>(queryKey, (old) => {
    if (!old || old.length === 0) return old
    return [
      {
        ...old[0],
        name: "Alice (Updating...)",
      },
    ]
  })

  try {
    // Perform the actual update
    const success = await actorManager.callMethod("updateUserProfile", {
      id: userId,
      name: "Alice Updated",
      email: "alice@example.com",
      createdAt: BigInt(Date.now()),
    })

    if (!success) {
      throw new Error("Update failed")
    }

    // Invalidate to refetch fresh data
    await queryClient.invalidateQueries({ queryKey })
  } catch (error) {
    // Rollback on error
    console.error("Update failed, rolling back:", error)
    queryClient.setQueryData(queryKey, previousData)
  }

  actorManager.cleanup()
}

/**
 * Example 5: Subscribing to State Changes
 */
async function stateSubscriptionExample() {
  const agentManager = new AgentManager()

  const actorManager = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withQueryClient: true,
  })

  // Subscribe to actor state changes
  const unsubscribe = actorManager.subscribeActorState((state) => {
    console.log("Actor state changed:", {
      initialized: state.initialized,
      initializing: state.initializing,
      error: state.error,
    })
  })

  // Initialize the actor
  await actorManager.initialize()

  // Make some calls
  await actorManager.callMethod("listUsers")

  // Unsubscribe when done
  unsubscribe()
  actorManager.cleanup()
}

/**
 * Example 6: Comparing with Zustand (Migration Example)
 */
async function migrationExample() {
  const agentManager = new AgentManager()

  // OLD WAY: Using Zustand (default)
  const zustandActor = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withDevtools: true, // Zustand devtools
  })

  // NEW WAY: Using TanStack Query
  const tanstackActor = new ActorManager<BackendActor>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    agentManager,
    withQueryClient: true, // TanStack Query
    queryClientConfig: {
      defaultStaleTime: 30000,
    },
  })

  // Both have the same API for calling methods
  await zustandActor.callMethod("getUserProfile", "user-123")
  await tanstackActor.callMethod("getUserProfile", "user-123")

  // But TanStack Query provides additional benefits:
  // - Automatic caching
  // - Request deduplication
  // - Smart refetching
  // - Better cache invalidation

  const queryClient = tanstackActor.getQueryClient()
  if (queryClient) {
    // Access to powerful TanStack Query features
    console.log("Fetching queries:", queryClient.isFetching())
  }

  zustandActor.cleanup()
  tanstackActor.cleanup()
}

// Export examples
export {
  basicExample,
  sharedQueryClientExample,
  manualCacheManagementExample,
  optimisticUpdatesExample,
  stateSubscriptionExample,
  migrationExample,
}
