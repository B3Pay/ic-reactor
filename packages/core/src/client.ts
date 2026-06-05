import type { Identity } from "@icp-sdk/core/agent"
import type { ClientManagerParameters, AgentState } from "./types/client"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryClient } from "@tanstack/react-query"

import { HttpAgent } from "@icp-sdk/core/agent"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { IC_HOST_NETWORK_URI } from "./utils/constants"
import {
  getNetworkByHostname,
  getProcessEnvNetwork,
  isDev,
} from "./utils/helper"

/**
 * ClientManager is a central class for managing the Internet Computer (IC) agent.
 *
 * It initializes the agent (connecting to local or mainnet) and integrates
 * with TanStack Query's QueryClient for state management.
 *
 * @example
 * ```typescript
 * import { ClientManager } from "@ic-reactor/core";
 * import { QueryClient } from "@tanstack/react-query";
 *
 * const queryClient = new QueryClient();
 * const clientManager = new ClientManager({
 *   queryClient,
 *   withLocalEnv: true, // Use local replica
 * });
 *
 * await clientManager.initialize();
 * ```
 */
export class ClientManager {
  #agent: HttpAgent
  #identitySubscribers: Array<(identity: Identity) => void> = []
  #agentStateSubscribers: Array<(state: AgentState) => void> = []
  #targetCanisterIds: Set<string> = new Set()

  /**
   * The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.
   */
  public queryClient: QueryClient
  /**
   * Current state of the HttpAgent, including initialization status, network, and error information.
   */
  public agentState: AgentState
  private initPromise?: Promise<void>

  /**
   * Creates a new instance of ClientManager.
   *
   * @param parameters - Configuration options for the agent and network environment.
   */
  constructor({
    port = 4943,
    withLocalEnv,
    withProcessEnv,
    withCanisterEnv,
    agentOptions = {},
    queryClient,
  }: ClientManagerParameters) {
    this.queryClient = queryClient

    this.agentState = {
      isInitialized: false,
      isInitializing: false,
      error: undefined,
      network: undefined,
      isLocalhost: false,
    }

    const canisterEnv =
      withCanisterEnv !== false && typeof window !== "undefined"
        ? safeGetCanisterEnv()
        : undefined
    const shouldUseCanisterEnv =
      withCanisterEnv === true || Boolean(canisterEnv)

    if (shouldUseCanisterEnv) {
      if (isDev() && typeof window !== "undefined") {
        agentOptions.host = agentOptions.host ?? window.location.origin
        if (agentOptions.verifyQuerySignatures == null) {
          agentOptions.verifyQuerySignatures = false
          console.warn(
            "[ic-reactor] Query signature verification is DISABLED in development. " +
              "Never use automatic ic_env detection in production without explicitly setting verifyQuerySignatures: true."
          )
        }
      } else {
        agentOptions.verifyQuerySignatures =
          agentOptions.verifyQuerySignatures ?? true
      }

      // Root key must NOT be sourced from the ic_env cookie: cookies are
      // user-controllable and accepting a root key from them would allow an
      // attacker to bypass all IC certificate verification.
      // If a custom root key is required (e.g. local replica), pass it via
      // agentOptions.rootKey in your application code instead.
      if (canisterEnv?.IC_ROOT_KEY) {
        console.error(
          "[ic-reactor] IC_ROOT_KEY in the ic_env cookie is ignored for security reasons. " +
            "Pass agentOptions.rootKey explicitly if you need a custom root key."
        )
      }
    }

    if (withProcessEnv) {
      const processNetwork = getProcessEnvNetwork()
      if (processNetwork === "ic") {
        agentOptions.host = IC_HOST_NETWORK_URI
      } else if (processNetwork === "local") {
        // Honor either `IC_HOST` (legacy dfx) or `ICP_HOST` (icp-cli).
        const envHost =
          typeof process !== "undefined"
            ? process.env.ICP_HOST || process.env.IC_HOST
            : undefined
        agentOptions.host = envHost ? envHost : `http://127.0.0.1:${port}`
      }
    } else if (withLocalEnv) {
      agentOptions.host = `http://127.0.0.1:${port}`
    } else if (!shouldUseCanisterEnv) {
      // Only set default host if ic_env has not already configured it.
      agentOptions.host = agentOptions.host ?? IC_HOST_NETWORK_URI
    }

    this.#agent = HttpAgent.createSync(agentOptions)
    this.updateAgentState({
      isLocalhost: this.isLocal,
      network: this.network,
    })
  }

  /**
   * Orchestrates the complete initialization of the ClientManager.
   * This method awaits the agent's core initialization (e.g., fetching root keys)
   * Authentication session restoration is handled by AuthenticationManager.
   *
   * @returns A promise that resolves to the ClientManager instance when core initialization is complete.
   */
  public async initialize() {
    await this.initializeAgent()
    return this
  }

  /**
   * Specifically initializes the HttpAgent.
   * On local networks, this includes fetching the root key for certificate verification.
   *
   * @returns A promise that resolves when the agent is fully initialized.
   */
  public async initializeAgent() {
    if (this.agentState.isInitialized) {
      return
    }
    if (this.agentState.isInitializing) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.updateAgentState({ isInitializing: true })
      if (isDev() && typeof window !== "undefined") {
        console.info(
          `%cic-reactor:%c Initializing agent for ${this.network} network`,
          "color: #3b82f6; font-weight: bold",
          "color: inherit",
          {
            host: this.agentHost?.toString(),
            isLocal: this.isLocal,
          }
        )
      }
      try {
        if (this.isLocal) {
          await this.#agent.fetchRootKey()
        }
        this.updateAgentState({ isInitialized: true, isInitializing: false })
      } catch (error) {
        this.updateAgentState({
          error: error as Error,
          isInitializing: false,
        })
        this.initPromise = undefined
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * The underlying HttpAgent managed by this class.
   */
  get agent() {
    return this.#agent
  }

  /**
   * The host URL of the current IC agent.
   */
  get agentHost(): URL | undefined {
    return this.#agent.host
  }

  /**
   * The hostname of the current IC agent.
   */
  get agentHostName() {
    return this.agentHost?.hostname || ""
  }

  /**
   * Returns true if the agent is connecting to a local environment.
   */
  get isLocal() {
    return this.network !== "ic"
  }

  /**
   * Returns the current network type ('ic' or 'local').
   */
  get network() {
    const hostname = this.agentHostName
    return getNetworkByHostname(hostname)
  }

  /**
   * Returns the current user's Principal identity.
   */
  public getUserPrincipal() {
    return this.#agent.getPrincipal()
  }

  /**
   * Registers a canister ID that this agent will interact with.
   * This is used for informational purposes and network detection.
   */
  public registerCanisterId(canisterId: string, name?: string): void {
    if (isDev() && typeof window !== "undefined") {
      const actorName = name || canisterId
      console.info(
        `%cic-reactor:%c Adding actor ${actorName}`,
        "color: #3b82f6; font-weight: bold",
        "color: inherit",
        {
          network: this.network,
          canisterId,
          ...(name && { name }),
        }
      )
    }
    this.#targetCanisterIds.add(canisterId)
  }

  /**
   * Returns a list of all canister IDs registered with this agent.
   */
  public connectedCanisterIds(): string[] {
    return Array.from(this.#targetCanisterIds)
  }

  /**
   * Get the subnet ID for a canister.
   */
  public getSubnetIdFromCanister(canisterId: string) {
    return this.#agent.getSubnetIdFromCanister(canisterId)
  }

  /**
   * Sync time with a specific subnet.
   */
  public syncTimeWithSubnet(subnetId: Principal) {
    return this.#agent.syncTimeWithSubnet(subnetId)
  }

  /**
   * Subscribes to identity changes (e.g., after login/logout).
   * @param callback - Function called with the new identity.
   * @returns An unsubscribe function.
   */
  public subscribe(callback: (identity: Identity) => void) {
    this.#identitySubscribers.push(callback)
    return () => {
      this.#identitySubscribers = this.#identitySubscribers.filter(
        (sub) => sub !== callback
      )
    }
  }

  /**
   * Subscribes to changes in the agent's initialization state.
   * @param callback - Function called with the updated agent state.
   * @returns An unsubscribe function.
   */
  public subscribeAgentState(callback: (state: AgentState) => void) {
    this.#agentStateSubscribers.push(callback)
    return () => {
      this.#agentStateSubscribers = this.#agentStateSubscribers.filter(
        (sub) => sub !== callback
      )
    }
  }

  /**
   * Replaces the current agent's identity and invalidates TanStack queries.
   * @param identity - The new identity to use.
   */
  public updateAgent(identity: Identity) {
    if (isDev() && typeof window !== "undefined") {
      console.info(
        `%cic-reactor:%c Updating agent identity`,
        "color: #3b82f6; font-weight: bold",
        "color: inherit",
        {
          principal: identity.getPrincipal().toText(),
        }
      )
    }
    // Cancel all queries for connected canisters to prevent race conditions
    // with the old identity
    this.connectedCanisterIds().forEach((canisterId) => {
      this.queryClient.cancelQueries({
        queryKey: [canisterId],
      })
    })

    this.#agent.replaceIdentity(identity)
    this.notifySubscribers(identity)
    this.queryClient.invalidateQueries()
  }

  private notifySubscribers(identity: Identity) {
    this.#identitySubscribers.forEach((sub) => sub(identity))
  }

  private notifyAgentStateSubscribers(state: AgentState) {
    this.#agentStateSubscribers.forEach((sub) => sub(state))
  }

  private updateAgentState(newState: Partial<AgentState>) {
    this.agentState = { ...this.agentState, ...newState }
    this.notifyAgentStateSubscribers(this.agentState)
  }
}
