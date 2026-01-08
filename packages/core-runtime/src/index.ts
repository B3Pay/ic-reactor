/**
 * @ic-reactor/core/runtime
 *
 * Runtime utilities for zero-config canister ID resolution.
 * Supports DFINITY's new dynamic canister ID approach via:
 * - Document cookies (asset canister on mainnet)
 * - Global variables (for SSR/custom setups)
 * - Local fallback (.icp/state.json for development)
 *
 * @example
 * ```ts
 * import { resolveCanisterId } from "@ic-reactor/core/runtime";
 *
 * // Automatically finds the canister ID from the environment
 * const backendId = resolveCanisterId("backend");
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CanisterIdSource {
  type: "cookie" | "global" | "icp-state" | "env" | "fallback"
  canisterId: string
}

export interface RuntimeConfig {
  /**
   * Enable debug logging for canister ID resolution
   */
  debug?: boolean

  /**
   * Custom fallback canister IDs (for testing or SSR)
   */
  fallbackIds?: Record<string, string>

  /**
   * Cookie name prefix used by asset canister
   * Default: "__icp_canister_id_"
   */
  cookiePrefix?: string

  /**
   * Global variable name for canister IDs
   * Default: "__icp_canister_ids__"
   */
  globalVariableName?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let runtimeConfig: RuntimeConfig = {
  debug: false,
  cookiePrefix: "__icp_canister_id_",
  globalVariableName: "__icp_canister_ids__",
}

const resolvedIds = new Map<string, CanisterIdSource>()

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configure the runtime canister ID resolution.
 *
 * @example
 * ```ts
 * configureRuntime({
 *   debug: true,
 *   fallbackIds: {
 *     backend: "rrkah-fqaaa-aaaaa-aaaaq-cai"
 *   }
 * });
 * ```
 */
export function configureRuntime(config: Partial<RuntimeConfig>): void {
  runtimeConfig = { ...runtimeConfig, ...config }
  resolvedIds.clear() // Clear cache when config changes
}

// ═══════════════════════════════════════════════════════════════════════════
// COOKIE RESOLUTION (DFINITY Asset Canister)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse the canister ID from document cookies.
 *
 * DFINITY's asset canister sets cookies like:
 * - `__icp_canister_id_backend=rrkah-fqaaa-aaaaa-aaaaq-cai`
 *
 * This allows dynamic canister IDs without rebuilding the frontend.
 */
function getCanisterIdFromCookie(canisterName: string): string | null {
  if (typeof document === "undefined") return null

  const cookieName = `${runtimeConfig.cookiePrefix}${canisterName}`
  const cookies = document.cookie.split(";")

  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=")
    if (name === cookieName && value) {
      return decodeURIComponent(value)
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL VARIABLE RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get canister ID from a global variable.
 *
 * This is useful for:
 * - SSR where cookies aren't available
 * - Custom build systems that inject IDs at runtime
 *
 * Expected format:
 * ```js
 * window.__icp_canister_ids__ = {
 *   backend: "rrkah-fqaaa-aaaaa-aaaaq-cai",
 *   frontend: "r7inp-6aaaa-aaaaa-aaabq-cai"
 * }
 * ```
 */
function getCanisterIdFromGlobal(canisterName: string): string | null {
  if (typeof window === "undefined") return null

  const globalVar = runtimeConfig.globalVariableName!
  const globals = (window as any)[globalVar] as
    | Record<string, string>
    | undefined

  if (globals && typeof globals === "object" && canisterName in globals) {
    return globals[canisterName]
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VARIABLE RESOLUTION (Legacy dfx compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get canister ID from process.env (for Vite's define).
 *
 * Supports both conventions:
 * - `CANISTER_ID_BACKEND` (dfx <= 0.14)
 * - `process.env.CANISTER_ID_BACKEND` (dfx >= 0.15)
 */
function getCanisterIdFromEnv(canisterName: string): string | null {
  if (typeof process === "undefined" || !process.env) return null

  const upperName = canisterName.toUpperCase()

  // Try dfx 0.15+ convention
  const envVar = `CANISTER_ID_${upperName}`
  if (process.env[envVar]) {
    return process.env[envVar]!
  }

  // Try legacy convention
  const legacyVar = `${upperName}_CANISTER_ID`
  if (process.env[legacyVar]) {
    return process.env[legacyVar]!
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// ICP-CLI STATE RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get canister ID from .icp/state.json (icp-cli).
 *
 * This is the development fallback when:
 * 1. Not running on mainnet (no cookies)
 * 2. Vite define wasn't set up
 *
 * The .icp/state.json file is created by `icp deploy` and contains:
 * ```json
 * {
 *   "canisters": {
 *     "backend": {
 *       "local": "rrkah-fqaaa-aaaaa-aaaaq-cai",
 *       "ic": "abc123-..."
 *     }
 *   }
 * }
 * ```
 */
function getCanisterIdFromIcpState(canisterName: string): string | null {
  // This would need to be pre-loaded during build or provided as a global
  // For now, we check if it was injected by the Vite plugin
  if (typeof window === "undefined") return null

  const icpState = (window as any).__ICP_STATE__ as
    | {
        canisters?: Record<string, { local?: string; ic?: string }>
        network?: "local" | "ic"
      }
    | undefined

  if (!icpState?.canisters?.[canisterName]) return null

  const network = icpState.network ?? "local"
  return icpState.canisters[canisterName][network] ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a canister ID using the priority chain:
 *
 * 1. **Cookies** - Dynamic IDs from asset canister (mainnet)
 * 2. **Global variables** - Custom runtime injection
 * 3. **Environment variables** - Vite define / dfx generate
 * 4. **ICP-CLI state** - Development .icp/state.json
 * 5. **Fallback IDs** - Configured defaults
 *
 * @param canisterName - The name of the canister (e.g., "backend")
 * @returns The canister ID as a string
 * @throws Error if no canister ID can be resolved
 *
 * @example
 * ```ts
 * // Basic usage
 * const backendId = resolveCanisterId("backend");
 *
 * // With debug logging
 * configureRuntime({ debug: true });
 * const backendId = resolveCanisterId("backend");
 * // Logs: [ic-reactor] Resolved backend from cookie: rrkah-...
 * ```
 */
export function resolveCanisterId(canisterName: string): string {
  // Check cache first
  if (resolvedIds.has(canisterName)) {
    const cached = resolvedIds.get(canisterName)!
    if (runtimeConfig.debug) {
      console.log(
        `[ic-reactor] ${canisterName} (cached from ${cached.type}): ${cached.canisterId}`
      )
    }
    return cached.canisterId
  }

  const sources: Array<
    () => { type: CanisterIdSource["type"]; id: string | null }
  > = [
    () => ({ type: "cookie", id: getCanisterIdFromCookie(canisterName) }),
    () => ({ type: "global", id: getCanisterIdFromGlobal(canisterName) }),
    () => ({ type: "env", id: getCanisterIdFromEnv(canisterName) }),
    () => ({ type: "icp-state", id: getCanisterIdFromIcpState(canisterName) }),
    () => ({
      type: "fallback",
      id: runtimeConfig.fallbackIds?.[canisterName] ?? null,
    }),
  ]

  for (const getSource of sources) {
    const { type, id } = getSource()
    if (id) {
      const source: CanisterIdSource = { type, canisterId: id }
      resolvedIds.set(canisterName, source)

      if (runtimeConfig.debug) {
        console.log(`[ic-reactor] Resolved ${canisterName} from ${type}: ${id}`)
      }

      return id
    }
  }

  // No canister ID found - throw helpful error
  throw new Error(
    `[ic-reactor] Could not resolve canister ID for "${canisterName}".

Tried the following sources (in order):
1. Cookie: ${runtimeConfig.cookiePrefix}${canisterName} - not found
2. Global: window.${runtimeConfig.globalVariableName}.${canisterName} - not found
3. Environment: process.env.CANISTER_ID_${canisterName.toUpperCase()} - not found
4. ICP State: window.__ICP_STATE__.canisters.${canisterName} - not found
5. Fallback: runtimeConfig.fallbackIds.${canisterName} - not configured

Possible solutions:
- On mainnet: Ensure your asset canister sets the cookie
- On local: Run 'icp deploy' to create .icp/state.json
- In Vite: Add the canister ID to your vite.config.ts define block
- As fallback: Call configureRuntime({ fallbackIds: { ${canisterName}: "your-id" } })
`
  )
}

/**
 * Get the source of a resolved canister ID (for debugging).
 */
export function getCanisterIdSource(
  canisterName: string
): CanisterIdSource | null {
  return resolvedIds.get(canisterName) ?? null
}

/**
 * Clear the canister ID cache (for testing or hot reload).
 */
export function clearCanisterIdCache(): void {
  resolvedIds.clear()
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL CLIENT MANAGER (Singleton)
// ═══════════════════════════════════════════════════════════════════════════

import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

let globalClientManager: ClientManager | null = null
let globalQueryClient: QueryClient | null = null

/**
 * Get or create the global ClientManager instance.
 *
 * This ensures all reactors share the same agent and auth state,
 * which is essential for:
 * - Single identity across all canisters
 * - Shared query cache
 * - Unified authentication state
 *
 * @example
 * ```ts
 * const clientManager = getGlobalClientManager();
 * const reactor = new Reactor({
 *   clientManager,
 *   canisterId: resolveCanisterId("backend"),
 *   idlFactory,
 * });
 * ```
 */
export function getGlobalClientManager(): ClientManager {
  if (globalClientManager) {
    return globalClientManager
  }

  // Create global query client
  globalQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        gcTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })

  // Expose for React Query DevTools
  if (typeof window !== "undefined") {
    ;(window as any).__IC_REACTOR_QUERY_CLIENT__ = globalQueryClient
  }

  // Create client manager with auto-detection
  globalClientManager = new ClientManager({
    queryClient: globalQueryClient,
    withProcessEnv: true, // Auto-detect network from env
    agentOptions: {
      verifyQuerySignatures: false, // For faster local dev
    },
  })

  // Auto-initialize
  globalClientManager.initialize().catch((err) => {
    console.error("[ic-reactor] Failed to initialize client manager:", err)
  })

  return globalClientManager
}

/**
 * Get the global QueryClient instance.
 */
export function getGlobalQueryClient(): QueryClient {
  if (!globalQueryClient) {
    getGlobalClientManager() // This initializes the query client
  }
  return globalQueryClient!
}

/**
 * Set a custom global ClientManager (for testing or SSR).
 */
export function setGlobalClientManager(clientManager: ClientManager): void {
  globalClientManager = clientManager
  globalQueryClient = clientManager.queryClient as QueryClient
}
