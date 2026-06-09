/**
 * IC Reactor Setup - Custom Provider Example
 *
 * This file demonstrates how to set up a ClientManager and auth hooks for
 * an ICRC1 token viewer with dynamic canister ID support using the v3 API.
 */
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { QueryClient } from "@tanstack/react-query"

// ============================================================================
// 1. Setup QueryClient and ClientManager
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
    },
  },
})

export const clientManager = new ClientManager({
  queryClient,
})
export const authentication = new AuthenticationManager({ clientManager })

// ============================================================================
// 2. Auth Hooks
// ============================================================================

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(authentication)
