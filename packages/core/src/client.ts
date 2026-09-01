import type { Identity } from "@icp-sdk/core/agent"
import type { ClientManagerParameters, AgentState } from "./types/client.js"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryClient } from "@tanstack/query-core"

import { HttpAgent } from "@icp-sdk/core/agent"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { IC_HOST_NETWORK_URI } from "./utils/constants.js"
import {
  getNetworkByHostname,
  getProcessEnvNetwork,
  isDev,
  isMainnetHost,
  allowsEnvRootKey,
} from "./utils/helper.js"

/**
 * ClientManager is a central class for managing the Internet Computer (IC) agent.
 *
 * It initializes the agent (connecting to local or mainnet) and integrates
 * with TanStack Query's QueryClient for state management.
 * Use this as a singleton shared by all reactors in an app.
 *
 * @example
 * ```typescript
 * import { ClientManager } from "@ic-reactor/core";
 * import { QueryClient } from "@tanstack/query-core";
 *
 * const queryClient = new QueryClient();
 * const clientManager = new ClientManager({
 *   queryClient,
 *   agentOptions: { host: "http://127.0.0.1:4943" },
 * });
 *
 * await clientManager.initialize();
 * ```
 *
 * @example
 * ```typescript
 * // Reuse the same ClientManager across multiple canisters
 * const backend = new Reactor<BackendService>({ clientManager, idlFactory: backendIdl, name: "backend" })
 * const ledger = new Reactor<LedgerService>({ clientManager, idlFactory: ledgerIdl, name: "ledger" })
 * ```
 */
export class ClientManager {
  #agent: HttpAgent
  #identitySubscribers: Array<(identity: Identity) => void> = []
  /** The identity currently installed on the agent, captured per call. */
  #identity?: Identity
  #agentStateSubscribers: Array<(state: AgentState) => void> = []
  #targetCanisterIds: Set<string> = new Set()
  /** Resolved once in the constructor; see {@link trustsEnvConfig}. */
  #trustsEnvConfig: boolean

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
    agentOptions = {},
    queryClient,
    allowEnvConfig,
    allowEnvRootKey,
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
      typeof window !== "undefined" ? safeGetCanisterEnv() : undefined

    // Locally deployed asset-canister pages and IC boundary domains can route
    // agent traffic through their serving origin. Ordinary web hosts (Vercel,
    // Cloudflare, etc.) cannot, so they retain the default IC API fallback.
    if (typeof window !== "undefined") {
      const browserOrigin = window.location.origin
      const browserNetwork = getNetworkByHostname(
        new URL(browserOrigin).hostname
      )
      if (browserNetwork === "local" || isMainnetHost(browserOrigin)) {
        agentOptions.host = agentOptions.host ?? browserOrigin
      }
    }

    if (isDev() && typeof window !== "undefined") {
      if (agentOptions.verifyQuerySignatures == null) {
        agentOptions.verifyQuerySignatures = false
      }
    } else {
      agentOptions.verifyQuerySignatures =
        agentOptions.verifyQuerySignatures ?? true
    }

    if (!agentOptions.host) {
      const processNetwork = getProcessEnvNetwork()
      if (processNetwork === "local") {
        const envHost =
          typeof process !== "undefined"
            ? process.env.ICP_HOST || process.env.IC_HOST
            : undefined
        agentOptions.host = envHost ?? "http://127.0.0.1:4943"
      } else {
        agentOptions.host = IC_HOST_NETWORK_URI
      }
    }

    // The ic_env cookie is not origin-isolated -- any sibling subdomain of the
    // registrable domain can write it -- so what it carries is trusted only
    // where the cookie is as trustworthy as the replica. This is a POSITIVE
    // allowlist.
    //
    // It used to read `!isMainnetHost(host)`, which fails OPEN: isMainnetHost
    // recognises exactly three boundary domains, so a production dapp served
    // from an ic-domains custom domain fell through it and took its root key
    // from a cookie. allowsEnvRootKey instead accepts only hosts that are
    // unambiguously a local replica; anything else must pass allowEnvConfig.
    //
    // Resolved ONCE here and read back through `trustsEnvConfig`, because the
    // cookie carries three values and each was deciding for itself: the root
    // key was guarded here, the Internet Identity provider recomputed the host
    // test (and so ignored an explicit opt-in), and the canister ID Reactor
    // resolves by name was not guarded at all (#348).
    this.#trustsEnvConfig =
      allowEnvConfig ?? allowEnvRootKey ?? allowsEnvRootKey(agentOptions.host)
    if (this.#trustsEnvConfig && canisterEnv?.IC_ROOT_KEY) {
      agentOptions.rootKey = agentOptions.rootKey ?? canisterEnv.IC_ROOT_KEY
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
   * Whether the configuration carried by the `ic_env` cookie may be trusted for
   * this agent's host.
   *
   * `true` for a local replica, or when the caller passed `allowEnvConfig`
   * (or the deprecated `allowEnvRootKey`). Every consumer of that cookie reads
   * this one decision, so the root key, the Internet Identity provider and a
   * reactor's canister ID cannot disagree about whether the environment is
   * trustworthy.
   */
  get trustsEnvConfig(): boolean {
    return this.#trustsEnvConfig
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
   * The identity currently installed on the agent, if one was set explicitly.
   *
   * Calls capture this at submit time and pass it back on every request they
   * make, so a sign-in or sign-out part-way through cannot re-sign a request
   * that is already in flight.
   */
  public get identity(): Identity | undefined {
    return this.#identity
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
    if (this.#targetCanisterIds.has(canisterId)) {
      return
    }
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
    // Cancel in-flight queries for connected canisters to prevent race conditions
    // with the old identity, then invalidate the same scope. Both are keyed on the
    // canister ID because every reactor query key starts with one. Apps commonly
    // share a QueryClient with the rest of their app, so an unfiltered
    // invalidateQueries() here would also refetch their unrelated REST/GraphQL
    // queries on every sign-in and sign-out.
    const canisterIds = this.connectedCanisterIds()
    canisterIds.forEach((canisterId) => {
      this.queryClient.cancelQueries({ queryKey: [canisterId] })
    })

    // The agent is mutated in place, so anything holding a reference to
    // `clientManager.agent` — an SDK Actor built during app setup, a transform
    // installed with `addTransform`, an `initializeAgent()` still fetching the
    // root key — keeps working across a sign-in. Pinning a call to the identity
    // that submitted it is handled per call instead, in `Reactor.executeCall`.
    this.#agent.replaceIdentity(identity)
    this.#identity = identity

    // Clean the cache BEFORE notifying, and after the agent already holds the
    // new identity. A subscriber commonly reacts by starting an imperative
    // `fetchQuery` for the new principal; that query has no observer yet, so it
    // would be classified inactive and `removeQueries` would cancel it, leaving
    // the subscriber's promise rejected with a TanStack CancelledError. Anything
    // a subscriber starts must therefore outlive this sweep. Refetches triggered
    // here are already signed by the new identity.
    canisterIds.forEach((canisterId) => {
      // Inactive entries are REMOVED, not just invalidated. Query keys carry no
      // principal, so a caller-scoped result (a balance-of-self, a deposit
      // address, my-profile) stays readable through getQueryData/fetchQuery
      // under the new identity for as long as it lives in the cache —
      // indefinitely for an entry whose component has unmounted, which is the
      // normal case when a sign-out unmounts the authenticated tree.
      // Invalidating alone left the data in place.
      this.queryClient.removeQueries({
        queryKey: [canisterId],
        type: "inactive",
      })
      // Active entries stay invalidated rather than removed, so their mounted
      // observers reliably refetch. They still show the previous identity's
      // data for the length of that refetch; closing that window needs the
      // principal in the key itself.
      this.queryClient.invalidateQueries({ queryKey: [canisterId] })
    })

    this.notifySubscribers(identity)
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
