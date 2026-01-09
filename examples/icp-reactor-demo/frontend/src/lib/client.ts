/**
 * IC-Reactor Client Configuration
 *
 * This file is where YOU configure your ClientManager and QueryClient.
 * The generated canister hooks will import from here.
 *
 * Customize this file to:
 * - Configure agent options (host, identity, etc.)
 * - Set up authentication providers
 * - Configure TanStack Query options
 */

import { QueryClient } from "@tanstack/react-query"
import { ClientManager, createAuthHooks } from "@ic-reactor/react"

// ═══════════════════════════════════════════════════════════════════════════
// QUERY CLIENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TanStack Query client for caching and state management.
 * Customize these options based on your app's needs.
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

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ClientManager handles agent lifecycle and authentication.
 *
 * Key features:
 * - Automatic agent initialization
 * - Internet Identity integration
 * - Identity change notifications
 *
 * This is the ONLY ClientManager for your app.
 * All generated reactors will use this instance.
 */
export const clientManager = new ClientManager({
  queryClient,
})

// Initialize on load
clientManager.initialize().catch(console.error)

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Authentication hooks for Internet Identity.
 * Use these in your components to handle login/logout.
 */
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)
