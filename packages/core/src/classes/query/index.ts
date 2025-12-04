import { QueryClient, QueryCache, MutationCache } from "@tanstack/query-core"

export interface QueryClientConfig {
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

/**
 * Creates a QueryClient instance with sensible defaults for IC Reactor
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const {
    defaultStaleTime = 30000, // 30 seconds
    defaultGcTime = 5 * 60 * 1000, // 5 minutes
    retry = 3,
    refetchOnWindowFocus = false,
  } = config

  const queryCache = new QueryCache({
    onError: (error: Error) => {
      console.error("Query error:", error)
    },
  })

  const mutationCache = new MutationCache({
    onError: (error: Error) => {
      console.error("Mutation error:", error)
    },
  })

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: defaultStaleTime,
        gcTime: defaultGcTime,
        retry,
        refetchOnWindowFocus,
        refetchOnReconnect: false,
        refetchOnMount: false,
      },
      mutations: {
        retry: 1,
      },
    },
  })
}

/**
 * Query key factory for actor-related queries
 */
export const actorKeys = {
  /**
   * Base key for all actor queries
   */
  all: (canisterId: string) => ["actor", canisterId] as const,

  /**
   * Key for actor initialization query
   */
  init: (canisterId: string) => [...actorKeys.all(canisterId), "init"] as const,

  /**
   * Key for actor state query
   */
  state: (canisterId: string) => [...actorKeys.all(canisterId), "state"] as const,

  /**
   * Key for query-type method calls (read operations)
   */
  method: (canisterId: string, methodName: string, argsHash: string) =>
    [...actorKeys.all(canisterId), "method", methodName, argsHash] as const,

  /**
   * Key for all calls to a specific method
   */
  methodAll: (canisterId: string, methodName: string) =>
    [...actorKeys.all(canisterId), "method", methodName] as const,

  /**
   * Key for update-type method calls (write operations)
   */
  mutation: (canisterId: string, methodName: string, argsHash: string) =>
    [...actorKeys.all(canisterId), "mutation", methodName, argsHash] as const,
}

/**
 * Agent-related query keys
 */
export const agentKeys = {
  all: () => ["agent"] as const,
  state: () => [...agentKeys.all(), "state"] as const,
  auth: () => [...agentKeys.all(), "auth"] as const,
}
