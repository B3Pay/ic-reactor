/**
 * IC-Reactor Configuration with ICP-CLI Environment
 *
 * This file demonstrates how to configure ic-reactor to work with the new
 * ICP SDK ecosystem:
 *
 * 1. @icp-sdk/core/agent/canister-env - Runtime canister ID resolution
 * 2. @icp-sdk/bindgen - Auto-generated TypeScript bindings
 * 3. @ic-reactor/react - React hooks for IC canister interaction
 */

import { QueryClient } from "@tanstack/react-query"
import {
  ClientManager,
  DisplayReactor,
  createQuery,
  createMutation,
  createSuspenseQuery,
  createAuthHooks,
  createQueryFactory,
} from "@ic-reactor/react"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import {
  _SERVICE,
  idlFactory,
} from "../bindings/backend/declarations/backend.did"

// Import generated bindings from @icp-sdk/bindgen
// These are auto-generated when you run `npm run generate` or when
// the Vite dev server detects changes to the .did file

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE CANISTER ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Define the expected canister environment variables.
 * These are set by the asset canister and served via the ic_env cookie.
 */
interface AppCanisterEnv {
  readonly "PUBLIC_CANISTER_ID:backend": string
}

/**
 * Get the canister environment from the ic_env cookie.
 *
 * This is the key integration point with the new ICP SDK:
 * - In development: Cookie is set by Vite dev server (see vite.config.ts)
 * - In production: Cookie is set by the asset canister automatically
 *
 * This means: NO REBUILD NEEDED when deploying to different networks!
 */
function getBackendCanisterId(): string {
  // Try to get from canister environment (cookie)
  const env = safeGetCanisterEnv<AppCanisterEnv>()

  if (env && env["PUBLIC_CANISTER_ID:backend"]) {
    console.log("[ic-reactor] Using canister ID from ic_env cookie")
    return env["PUBLIC_CANISTER_ID:backend"]
  }

  // Fallback for development without cookie
  console.warn(
    "[ic-reactor] ic_env cookie not found, using fallback canister ID"
  )
  return "rrkah-fqaaa-aaaaa-aaaaq-cai" // Local replica default
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY CLIENT & CLIENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TanStack Query client for caching and state management.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Get agent options based on canister environment.
 * This configures the agent to work with the IC root key from the cookie.
 */
function getAgentOptions() {
  const env = safeGetCanisterEnv<AppCanisterEnv>()

  // Development mode - use Vite proxy and root key from cookie
  if (import.meta.env.DEV) {
    // Use the current origin which goes through Vite's proxy
    // The proxy in vite.config.ts forwards /api/* to the local replica
    // This avoids CORS issues when fetching root key or making calls
    return {
      host: window.location.origin,
      // Pass the root key from cookie so agent doesn't need to fetch it
      rootKey: env?.IC_ROOT_KEY,
      verifyQuerySignatures: false,
    }
  }

  // Production mode - use root key from asset canister's ic_env cookie
  return {
    rootKey: env?.IC_ROOT_KEY,
    verifyQuerySignatures: true,
  }
}

/**
 * ClientManager handles agent lifecycle and authentication.
 *
 * Key features:
 * - Automatic agent initialization
 * - Internet Identity integration
 * - Identity change notifications
 */
export const clientManager = new ClientManager({
  queryClient,
  agentOptions: getAgentOptions(),
})

// Initialize the client manager
clientManager.initialize().catch(console.error)

// ═══════════════════════════════════════════════════════════════════════════
// REACTOR INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Backend Reactor with DisplayReactor transformation.
 *
 * DisplayReactor automatically converts:
 * - bigint → string
 * - Principal → string
 * - Uint8Array → string (hex)
 *
 * This makes the data React-friendly without manual conversion.
 */
export const backendReactor = new DisplayReactor<_SERVICE>({
  clientManager,
  canisterId: getBackendCanisterId(),
  idlFactory,
  name: "backend",
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS (auto-generated style)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query: greet
 * Candid: greet : (text) -> (text) query
 */
export const greetQuery = createQueryFactory(backendReactor, {
  functionName: "greet",
})

/**
 * Query: get_message
 * Candid: get_message : () -> (opt text) query
 */
export const getMessageQuery = createQuery(backendReactor, {
  functionName: "get_message",
})

/**
 * Query: get_counter
 * Candid: get_counter : () -> (nat) query
 */
export const getCounterQuery = createQuery(backendReactor, {
  functionName: "get_counter",
  refetchInterval: 3000, // Poll every 3 seconds
})

/**
 * Suspense version of get_counter for React Suspense
 */
export const getCounterSuspense = createSuspenseQuery(backendReactor, {
  functionName: "get_counter",
})

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mutation: set_message
 * Candid: set_message : (text) -> ()
 */
export const setMessageMutation = createMutation(backendReactor, {
  functionName: "set_message",
  invalidateQueries: [getMessageQuery.getQueryKey()],
})

/**
 * Mutation: increment
 * Candid: increment : () -> (nat)
 */
export const incrementMutation = createMutation(backendReactor, {
  functionName: "increment",
  invalidateQueries: [getCounterQuery.getQueryKey()],
})

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { backendReactor as reactor }
export type { _SERVICE as BackendService }
