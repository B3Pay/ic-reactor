import type { HttpAgentOptions, Identity } from "@icp-sdk/core/agent"
import type { ClientManagerParameters, AgentState } from "./types/client.js"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryClient, QueryKey } from "@tanstack/query-core"

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
 * The origin of the page this code runs for. A web worker has no `window`,
 * but its global scope has a `location` (the worker script's URL), whose
 * origin is that of the page that started it: a blob: worker reports its
 * creator's origin too. Node has neither. Deno 2 has no `window`, and reading
 * its `location` throws unless it was started with `--location`.
 */
const pageOrigin = (): string | undefined => {
  if (typeof window !== "undefined") return window.location?.origin
  try {
    return (globalThis as { location?: { origin?: string } }).location?.origin
  } catch {
    return undefined
  }
}

/**
 * Whether this code runs in a browser: on a page, or in a web worker, which
 * has no `window` but has the `location` that `pageOrigin` reads.
 */
const inBrowser = (): boolean =>
  typeof window !== "undefined" || pageOrigin() !== undefined

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
 * The hostname `HttpAgent` connects to for `host`, found the way the agent
 * finds it (`determineHost` in `@icp-sdk/core`): on a page, a host that does
 * not start with a scheme, such as `127.0.0.1:4943` or a bare Codespaces
 * domain, is read against the page's protocol. `new URL` alone rejects such a
 * host or finds no hostname in it, which took a local replica for mainnet.
 * The agent's scheme test is copied as is, so `localhost:4943`, which it reads
 * as the scheme `localhost:`, has no hostname here either.
 */
const agentHostnameOf = (host: string | undefined): string | undefined => {
  if (!host) return undefined
  try {
    return (
      !/^[a-z]+:/.test(host) && typeof window !== "undefined"
        ? new URL(`${window.location.protocol}//${host}`)
        : new URL(host)
    ).hostname
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
 * How many times {@link ClientManager.fetchAcrossIdentitySwitch} runs a fetch
 * again after a principal switch cancelled it. Each run needs a switch of its
 * own while it is in flight, so the bound is reached only when the identity
 * keeps changing faster than the canister answers.
 */
const IDENTITY_SWITCH_REFETCHES = 3

/**
 * Whether `error` is the `CancelledError` a TanStack Query fetch rejects with
 * when it is cancelled. The class cannot be imported to test against:
 * `@tanstack/query-core` is an optional peer that core imports only for types,
 * and the QueryClient may come from another copy of it. The class extends
 * `Error` only in later v5 releases, but every v5 release sets its own
 * `revert` and `silent` fields.
 */
const isQueryCancellation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "revert" in error &&
  "silent" in error

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
 * // Reuse the same ClientManager across multiple canisters. `canisterId` is
 * // required in Node, where the constructor otherwise throws; a browser page
 * // may omit it only where the ic_env cookie is trusted (a local replica, or
 * // `allowEnvConfig: true`).
 * const backend = new Reactor<BackendService>({
 *   clientManager,
 *   idlFactory: backendIdl,
 *   name: "backend",
 *   canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
 * })
 * const ledger = new Reactor<LedgerService>({
 *   clientManager,
 *   idlFactory: ledgerIdl,
 *   name: "ledger",
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 * })
 * ```
 */
export class ClientManager {
  #agent: HttpAgent
  #identitySubscribers: Array<(identity: Identity) => void> = []
  /** The identity currently installed on the agent, captured per call. */
  #identity?: Identity
  /**
   * The principal `#identity` had when it was installed. It is read then and
   * kept, because an identity object may change its principal afterwards.
   */
  #principal?: string
  /**
   * Counts `updateAgent` calls that switched to another principal, so a fetch
   * can tell that one cancelled it; see {@link fetchAcrossIdentitySwitch}.
   */
  #principalSwitches = 0
  /** Counts `updateAgent` calls, so a notification can tell it is stale. */
  #identityRevision = 0
  #agentStateSubscribers: Array<(state: AgentState) => void> = []
  #targetCanisterIds: Set<string> = new Set()
  /** Resolved once in the constructor; see {@link trustsEnvConfig}. */
  #trustsEnvConfig: boolean
  /** The caller's own `agentOptions.rootKey`; see {@link explicitRootKey}. */
  #explicitRootKey?: Uint8Array

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
    // Read from the caller's options, before the `ic_env` cookie can fill the
    // copy: only a key the caller chose is kept by `initializeAgent`.
    this.#explicitRootKey = givenAgentOptions.rootKey ?? undefined

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
    // A Codespaces or Gitpod page ("remote") is a local dev server forwarded
    // to the browser, so it routes like a local one. It used to fall back to
    // mainnet, so a dev app in a codespace sent its local canister IDs to
    // ic0.app, and whatever mainnet canister had that ID answered.
    //
    // A page with no usable origin is skipped rather than parsed: React Native
    // defines `window` without a `location`, and an opaque origin (a file://
    // page in Firefox, an about:blank or srcdoc frame) reads as the string
    // "null", which `new URL` rejects. Neither can route agent traffic.
    //
    // A web worker the page started routes like the page. The origin used to
    // come from `window` alone, so a worker fell back to mainnet: a local dev
    // page's worker sent its calls, with local canister IDs, to ic0.app.
    const browserOrigin = pageOrigin()
    const browserHostname = hostnameOf(browserOrigin)
    if (browserOrigin && browserHostname !== undefined) {
      const browserNetwork = getNetworkByHostname(browserHostname)
      if (browserNetwork !== "ic" || isMainnetHost(browserOrigin)) {
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

    // The network the agent will talk to, which decides both the query
    // signature default and whether the agent fetches its root key. It is read
    // from the host as the agent reads it, so it matches `network`.
    const hostNetwork = getNetworkByHostname(
      agentHostnameOf(agentOptions.host) ?? ""
    )

    // A subnet's nodes sign every query response, and checking those
    // signatures is what stops anything between the agent and the subnet from
    // answering a query in its name. A development build in the browser skips
    // the check by default only for a local replica: the agent fetches that
    // replica's root key from the replica itself, so signatures checked under
    // it prove little. It used to skip it for every host, so a dev server page
    // pointed at mainnet accepted unsigned answers. An explicit setting wins.
    //
    // A web worker is in the browser too and decides as its page does. The
    // test read `window` alone, so a development build's worker checked a
    // local replica's signatures while its page did not.
    if (isDev() && inBrowser() && hostNetwork !== "ic") {
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
    // That includes the Codespaces and Gitpod domains: every workspace on
    // them is a sibling of every stranger's, so their cookie is not the
    // replica's. A root key the agent needs there is fetched from the replica.
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
    // shares one fetch between its requests and `initializeAgent`. A root key
    // given explicitly is used as is and kept; one taken from the `ic_env`
    // cookie is used until `initializeAgent` replaces it with the fetched one.
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
   * That covers every host whose network isn't `"ic"`, Codespaces and Gitpod
   * included. The fetched key replaces the key the agent holds: one from the
   * `ic_env` cookie, or mainnet's when `shouldFetchRootKey` is `false`.
   *
   * A key passed as `agentOptions.rootKey` is kept instead: nothing is
   * fetched, so `/api/v2/status` is not requested and need not be reachable,
   * and the agent verifies against that key before and after this call alike.
   * On a mainnet host nothing is fetched either way.
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
      // A key the caller passed is the key they chose to verify against: a
      // PocketIC or testnet key, or that of the network behind a local proxy.
      // It used to be replaced here by whatever the host served, so calls made
      // before this point checked one key and later calls another, and this
      // failed whenever `/api/v2/status` could not be reached. A key from the
      // `ic_env` cookie is still replaced: the replica's own is the one to
      // trust. `shouldFetchRootKey: false` alone still fetches, as code
      // written for older agents relies on this call for the key.
      if (this.isLocal && !this.#explicitRootKey) {
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
   * local replica (loopback, `localhost` and its subdomains), or when the
   * caller passed `allowEnvConfig`. The page counts because the page is what
   * decides who can write the cookie. A Codespaces or Gitpod domain shares its
   * parent with other users' workspaces, so it needs `allowEnvConfig`.
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
   * The root key the caller passed as `agentOptions.rootKey`, which the agent
   * keeps: on a local host {@link initializeAgent} does not replace it with
   * the key the host serves. `undefined` when none was passed, also when the
   * agent took one from the `ic_env` cookie.
   */
  get explicitRootKey(): Uint8Array | undefined {
    return this.#explicitRootKey
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
   * Installs `identity` on the agent, cleans the cached queries of every
   * registered canister when the principal changes, and notifies identity
   * subscribers.
   *
   * Query keys carry no principal, so on a switch to another principal
   * (signing in, signing out, switching users) the cache is swept: queries in
   * flight are cancelled, inactive entries are removed, and the rest are
   * invalidated, so mounted queries refetch as the new principal.
   *
   * When `identity` has the principal already installed (a renewed delegation,
   * a sign-in while signed in, an identity attribute request), the cached
   * answers are already that principal's and are kept: nothing is cancelled or
   * removed, and no query that succeeded refetches. Only queries whose last
   * fetch failed are invalidated, since the old identity may be why they
   * failed (an expired delegation, or one not valid for that canister). The
   * first call after construction always sweeps.
   *
   * The comparison sees only the principal. An identity that changes what a
   * canister is told under the same principal, such as an `AttributesIdentity`
   * adding signed `sender_info` to each request, keeps answers computed
   * without it. After installing or removing one, invalidate the affected
   * queries yourself, e.g. with `reactor.invalidateQueries()`.
   *
   * @param identity - The new identity to use.
   */
  public updateAgent(identity: Identity) {
    const principal = identity.getPrincipal().toText()
    if (isDev() && typeof window !== "undefined") {
      console.info(
        `%cic-reactor:%c Updating agent identity`,
        "color: #3b82f6; font-weight: bold",
        "color: inherit",
        { principal }
      )
    }
    // Cancel in-flight queries for connected canisters to prevent race conditions
    // with the old identity, then invalidate the same scope. Both are keyed on the
    // canister ID because every reactor query key starts with one. Apps commonly
    // share a QueryClient with the rest of their app, so an unfiltered
    // invalidateQueries() here would also refetch their unrelated REST/GraphQL
    // queries on every sign-in and sign-out.
    //
    // One filter covers every connected canister, so each step walks the cache
    // once. A filter per canister walked it once per canister per step, and a
    // manager remembers every canister it was ever told about: with 1,000
    // registered canisters and 3,000 cached queries a sign-in spent 166 ms here.
    const canisterIds = new Set(this.connectedCanisterIds())
    const ofConnectedCanister = ({ queryKey }: { queryKey: QueryKey }) => {
      const root = queryKey[0]
      return typeof root === "string" && canisterIds.has(root)
    }

    // The same principal again (a renewed delegation, a sign-in while signed
    // in, an identity attribute request) keeps the cache. The sweep exists
    // because query keys carry no principal, so it has nothing to protect
    // when every canister still sees the same caller. It used to run anyway,
    // and each of those dropped every inactive entry, refetched every mounted
    // query and rejected every imperative fetch in flight. The principal is
    // compared with the one read when the previous identity was installed,
    // not read from that object again: an identity object that changed its
    // principal since is a switch. The first call after construction always
    // sweeps, as until then nothing was installed to compare with.
    const renewal =
      this.#identity !== undefined && principal === this.#principal
    if (!renewal) {
      this.#principalSwitches++
    }
    const sweep = !renewal && canisterIds.size > 0
    if (sweep) {
      void this.queryClient.cancelQueries({ predicate: ofConnectedCanister })
    }

    // The agent is mutated in place, so anything holding a reference to
    // `clientManager.agent` — an SDK Actor built during app setup, a transform
    // installed with `addTransform`, an `initializeAgent()` still fetching the
    // root key — keeps working across a sign-in. Pinning a call to the identity
    // that submitted it is handled per call instead, in `Reactor.executeCall`.
    this.#agent.replaceIdentity(identity)
    this.#identity = identity
    this.#principal = principal

    // Clean the cache BEFORE notifying, and after the agent already holds the
    // new identity. A subscriber commonly reacts by starting an imperative
    // `fetchQuery` for the new principal; that query has no observer yet, so it
    // would be classified inactive and `removeQueries` would cancel it, leaving
    // the subscriber's promise rejected with a TanStack CancelledError. Anything
    // a subscriber starts must therefore outlive this sweep. Refetches triggered
    // here are already signed by the new identity.
    if (sweep) {
      // Inactive entries are REMOVED, not just invalidated. Query keys carry no
      // principal, so a caller-scoped result (a balance-of-self, a deposit
      // address, my-profile) stays readable through getQueryData/fetchQuery
      // under the new identity for as long as it lives in the cache —
      // indefinitely for an entry whose component has unmounted, which is the
      // normal case when a sign-out unmounts the authenticated tree.
      // Invalidating alone left the data in place.
      this.queryClient.removeQueries({
        predicate: ofConnectedCanister,
        type: "inactive",
      })
      // Active entries stay invalidated rather than removed, so their mounted
      // observers reliably refetch. They still show the previous identity's
      // data for the length of that refetch; closing that window needs the
      // principal in the key itself.
      void this.queryClient.invalidateQueries({
        predicate: ofConnectedCanister,
      })
    } else if (renewal && canisterIds.size > 0) {
      // The previous identity may be why a fetch failed: a delegation that
      // had expired, or one not valid for that canister. Those entries are
      // refetched as the new identity. An answer that arrived is still the
      // same caller's, and stays.
      void this.queryClient.invalidateQueries({
        predicate: (query) =>
          query.state.status === "error" && ofConnectedCanister(query),
      })
    }

    this.notifySubscribers(identity)
  }

  /**
   * Runs `fetch`, a fetch of a registered canister's query through
   * {@link queryClient}, and runs it again when a switch to another principal
   * cancels it.
   *
   * `updateAgent` cancels those queries when the principal changes, so an
   * answer fetched for the previous principal never reaches the cache. A
   * query with a mounted observer refetches afterwards. An imperative fetch
   * has no observer, and its promise rejected with TanStack's
   * `CancelledError`, which is neither a `CallError` nor a `CanisterError`, so
   * a route loader running during a sign-in or sign-out failed. Through this
   * method it resolves with the answer for the identity installed now, as a
   * mounted query would show; the previous identity's answer is still never
   * cached.
   *
   * `Reactor.fetchQuery`, and with it the query factories' `fetch()`, runs
   * through here. Wrap any other fetch of a canister query the same way.
   *
   * A rejection other than a cancellation, and a cancellation with no
   * principal switch while `fetch` ran, such as one from
   * `queryClient.cancelQueries()`, is passed on as is. So is the cancellation
   * after three runs again, each cut short by another switch, so the loop
   * always ends.
   *
   * @param fetch - Starts the fetch. It is called once per run, so it has to
   * start a fetch each time rather than return one promise it kept.
   * @returns What `fetch` resolved with.
   *
   * @example
   * ```typescript
   * const pages = await clientManager.fetchAcrossIdentitySwitch(() =>
   *   clientManager.queryClient.fetchInfiniteQuery(options)
   * )
   * ```
   */
  public async fetchAcrossIdentitySwitch<T>(
    fetch: () => Promise<T>
  ): Promise<T> {
    for (let refetches = 0; ; refetches++) {
      const switches = this.#principalSwitches
      try {
        return await fetch()
      } catch (error) {
        const cancelledBySwitch =
          this.#principalSwitches !== switches && isQueryCancellation(error)
        if (!cancelledBySwitch || refetches >= IDENTITY_SWITCH_REFETCHES) {
          throw error
        }
      }
    }
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
