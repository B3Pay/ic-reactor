import type { HttpAgentOptions, Identity } from "@icp-sdk/core/agent"
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

/** The hostname of a page origin, or `undefined` when it is not a URL. */
const hostnameOf = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined
  try {
    return new URL(origin).hostname
  } catch {
    return undefined
  }
}

/**
 * Tells `subscribers` about a change the manager has already made.
 *
 * Every subscriber is called even when one throws, and the first error is
 * rethrown once they all have been, so the caller still sees it. A throw used
 * to end the loop, and the subscribers after it never heard about an identity
 * the agent was already signing with.
 *
 * A subscriber may make a newer change from inside its callback: sign out a
 * principal it does not accept, or retry an initialization that failed. That
 * change tells every subscriber about itself, so once `isCurrent` says `value`
 * has been replaced this loop stops rather than deliver the older value after
 * the newer one. The last value each subscriber hears is the current one.
 *
 * The list is copied first, so a subscriber added during the loop is first
 * called for the next change, as it was with `forEach`.
 */
function notifyAll<T>(
  subscribers: ReadonlyArray<(value: T) => void>,
  value: T,
  isCurrent: () => boolean
): void {
  let failure: { error: unknown } | undefined
  for (const subscriber of [...subscribers]) {
    if (!isCurrent()) break
    try {
      subscriber(value)
    } catch (error) {
      failure ??= { error }
    }
  }
  if (failure) throw failure.error
}

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
  /** Counts `updateAgent` calls, so a notification can tell it is stale. */
  #identityRevision = 0
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
    agentOptions: givenAgentOptions = {},
    queryClient,
    allowEnvConfig,
    allowEnvRootKey,
  }: ClientManagerParameters) {
    this.queryClient = queryClient

    // Everything below resolves into this copy, never into the caller's
    // object: that one may be frozen, or shared with another manager that must
    // not inherit the host, the verification setting, or a root key this one
    // took from the `ic_env` cookie under its own trust decision.
    const agentOptions: HttpAgentOptions = { ...givenAgentOptions }

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
    //
    // A page with no usable origin is skipped rather than parsed: React Native
    // defines `window` without a `location`, and an opaque origin (a file://
    // page in Firefox, an about:blank or srcdoc frame) reads as the string
    // "null", which `new URL` rejects. Neither can route agent traffic.
    const browserOrigin =
      typeof window !== "undefined" ? window.location?.origin : undefined
    const browserHostname = hostnameOf(browserOrigin)
    if (browserOrigin && browserHostname !== undefined) {
      const browserNetwork = getNetworkByHostname(browserHostname)
      if (browserNetwork === "local" || isMainnetHost(browserOrigin)) {
        agentOptions.host = agentOptions.host ?? browserOrigin
      }
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

    const hostNetwork = getNetworkByHostname(
      hostnameOf(agentOptions.host) ?? ""
    )

    // A subnet's nodes sign every query response, and checking those
    // signatures is what stops anything between the agent and the subnet from
    // answering a query in its name. A development build in the browser skips
    // the check by default only for a local replica: the agent fetches that
    // replica's root key from the replica itself, so signatures checked under
    // it prove little. It used to skip it for every host, so a dev server page
    // pointed at mainnet accepted unsigned answers. An explicit setting wins.
    if (isDev() && typeof window !== "undefined" && hostNetwork !== "ic") {
      agentOptions.verifyQuerySignatures ??= false
    } else {
      agentOptions.verifyQuerySignatures ??= true
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
    //
    // `allowEnvRootKey` is deliberately NOT part of this decision. It granted
    // the root key and only the root key, and a caller who set it for a custom
    // testnet did not thereby agree to take their login redirect and their
    // canister IDs from the same cookie. A rename must not widen a grant that
    // is already out there, so the old spelling keeps its old reach below and
    // `allowEnvConfig` is what opts into the whole cookie.
    //
    // The PAGE has to clear the bar as well as the agent host, because the page
    // is what decides who can write the cookie: a document on
    // app.example.com pointed at a loopback replica shares its cookie jar with
    // every sibling of example.com, and the agent host says nothing about that.
    // Both sides are required, so the automatic grant only covers the case
    // where the cookie is as trustworthy as the replica it describes. Off the
    // browser there is no cookie to trust at all.
    const hostIsLocal = allowsEnvRootKey(agentOptions.host)
    const pageIsLocal =
      typeof window !== "undefined" && allowsEnvRootKey(window.location?.origin)
    this.#trustsEnvConfig = allowEnvConfig ?? (hostIsLocal && pageIsLocal)

    // The root key keeps the keying it shipped with in 3.12.0 — agent host
    // only. Tightening it here would revert a reviewed decision and break the
    // test that pins it, so it is left to the maintainer; see the pull request.
    const acceptEnvRootKey = allowEnvConfig ?? allowEnvRootKey ?? hostIsLocal
    if (acceptEnvRootKey && canisterEnv?.IC_ROOT_KEY) {
      agentOptions.rootKey = agentOptions.rootKey ?? canisterEnv.IC_ROOT_KEY
    }

    // A local replica certifies its answers with its own root key.
    // `initializeAgent` fetches it, but an agent built without one starts out
    // holding mainnet's and checks every certificate against that until then.
    // Nothing waits for `initializeAgent` before a call, so a call made in
    // that window failed verification — and an update call had already run on
    // the replica by the time it was reported as failed. Asking the agent to
    // fetch the key itself makes every request wait for it instead. The agent
    // shares one fetch between its requests and `initializeAgent`, and a root
    // key given explicitly or taken from the `ic_env` cookie is used as is
    // until `initializeAgent` replaces it with the fetched one.
    if (hostNetwork !== "ic") {
      agentOptions.shouldFetchRootKey ??= true
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
   * That covers every host whose network isn't `"ic"`, dev-container tunnels
   * included. The fetched key replaces whatever key the agent holds: one passed
   * as `agentOptions.rootKey`, one from the `ic_env` cookie, or mainnet's when
   * `shouldFetchRootKey` is `false`.
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

    // The attempt's promise is stored BEFORE the attempt runs. Running it
    // notifies subscribers synchronously, and a subscriber may call back in
    // from there: on "initializing" it has to join this attempt, and on the
    // error of an attempt that failed synchronously it starts a retry, which
    // stores a promise of its own. An async function runs up to its first
    // `await` before its caller can store the promise it returns, so storing
    // it on return left the "initializing" subscriber nothing to join, and
    // let a failed attempt overwrite its retry's promise with its own
    // rejection, which every later caller received while the retry ran.
    let settle!: {
      resolve: () => void
      reject: (reason: unknown) => void
    }
    const attempt = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject }
    })
    this.initPromise = attempt
    this.runAgentInitialization(attempt).then(settle.resolve, settle.reject)

    return attempt
  }

  /**
   * Runs one `initializeAgent` attempt. `attempt` is the promise its callers
   * were given.
   */
  private async runAgentInitialization(attempt: Promise<void>) {
    try {
      // A failed attempt leaves its error here and clears initPromise so the
      // caller can retry. Clearing it as each attempt starts means a retry
      // that succeeds reports the initialized state without the old error.
      //
      // This runs inside the try because it notifies subscribers
      // synchronously: one that throws has to fail this attempt like any
      // other error, not reject it with `isInitializing` still set — which
      // made every later call return the same rejected promise, forever.
      this.updateAgentState({ isInitializing: true, error: undefined })
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
      if (this.isLocal) {
        await this.#agent.fetchRootKey()
      }
      this.updateAgentState({ isInitialized: true, isInitializing: false })
    } catch (error) {
      // Only the attempt that owns initPromise clears it, and it does so
      // before announcing the failure: a subscriber may retry from that
      // announcement, and the retry's promise has to outlive this attempt.
      if (this.initPromise === attempt) {
        this.initPromise = undefined
      }
      this.updateAgentState({
        error: error as Error,
        isInitializing: false,
        // A subscriber that throws on the "initialized" notification fails the
        // attempt after `isInitialized` was recorded. Left standing, it made
        // every later call return at once, so the error was never cleared.
        isInitialized: false,
      })
      throw error
    }
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
   * `true` when BOTH the agent host and the page origin are unambiguously a
   * local replica, or when the caller passed `allowEnvConfig`. The page counts
   * because the page is what decides who can write the cookie.
   * Every consumer of that cookie reads this one decision, so the root key, the
   * Internet Identity provider and a reactor's canister ID cannot disagree
   * about whether the environment is trustworthy.
   *
   * The deprecated `allowEnvRootKey` is not enough on its own: it granted the
   * root key alone, and is honoured for the root key alone.
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
   *
   * Callbacks run in the order they subscribed, after the agent already holds
   * the new identity. A callback that throws does not stop the others; the
   * first error is rethrown from `updateAgent` once they have all run. When a
   * callback itself calls `updateAgent`, the identity that replaced this one
   * is the last each callback hears.
   *
   * @param callback - Function called with the new identity.
   * @returns An unsubscribe function.
   */
  public subscribe(callback: (identity: Identity) => void) {
    // Each subscription gets an entry of its own, so the unsubscribe it returns
    // removes that one registration and no other. Filtering on the callback
    // itself removed every registration of a function subscribed twice.
    const subscription = (identity: Identity) => callback(identity)
    this.#identitySubscribers.push(subscription)
    return () => {
      this.#identitySubscribers = this.#identitySubscribers.filter(
        (sub) => sub !== subscription
      )
    }
  }

  /**
   * Subscribes to changes in the agent's initialization state.
   *
   * Delivery works as for {@link subscribe}: every callback runs even when one
   * throws, and a newer state set from inside a callback is the last state
   * each callback hears.
   *
   * @param callback - Function called with the updated agent state.
   * @returns An unsubscribe function.
   */
  public subscribeAgentState(callback: (state: AgentState) => void) {
    // One entry per subscription, as in `subscribe`.
    const subscription = (state: AgentState) => callback(state)
    this.#agentStateSubscribers.push(subscription)
    return () => {
      this.#agentStateSubscribers = this.#agentStateSubscribers.filter(
        (sub) => sub !== subscription
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
      void this.queryClient.cancelQueries({ queryKey: [canisterId] })
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
      void this.queryClient.invalidateQueries({ queryKey: [canisterId] })
    })

    this.notifySubscribers(identity)
  }

  private notifySubscribers(identity: Identity) {
    const revision = ++this.#identityRevision
    notifyAll(
      this.#identitySubscribers,
      identity,
      () => this.#identityRevision === revision
    )
  }

  private notifyAgentStateSubscribers(state: AgentState) {
    notifyAll(
      this.#agentStateSubscribers,
      state,
      () => this.agentState === state
    )
  }

  private updateAgentState(newState: Partial<AgentState>) {
    const state = { ...this.agentState, ...newState }
    this.agentState = state
    this.notifyAgentStateSubscribers(state)
  }
}
