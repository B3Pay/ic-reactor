import type {
  Agent,
  CallConfig,
  PollingOptions,
  ReadStateOptions,
} from "@icp-sdk/core/agent"
import type { ClientManager } from "./client.js"
import type {
  QueryKey,
  FetchQueryOptions,
  QueryOptions,
} from "@tanstack/query-core"
import type {
  ReactorParameters,
  BaseActor,
  ActorMethodParameters,
  ActorMethodReturnType,
  FunctionName,
  TransformKey,
  ReactorArgs,
  ReactorReturnOk,
  ReactorReturnErr,
  ReactorQueryData,
  ReactorQueryParams,
  ReactorCallParams,
  CanisterId,
} from "./types/reactor.js"

import { AnonymousIdentity, DEFAULT_POLLING_OPTIONS } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import {
  generateKey,
  extractOkResult,
  toHashableKeySegment,
} from "./utils/helper.js"
import { toReactorQueryData } from "./utils/query-data.js"
import { candidArgsKey } from "./utils/args-key.js"
import {
  processQueryCallResponse,
  processUpdateCallResponse,
} from "./utils/agent.js"
import {
  CallError,
  isRetryableUpdateError,
  isCallError,
  isCanisterError,
  isValidationError,
} from "./errors/index.js"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"

/**
 * A fresh `AnonymousIdentity` when `agent` currently signs as the anonymous
 * principal, which it then signs exactly like, and `undefined` otherwise:
 * another identity cannot be read back from the agent, and one it cannot
 * report (after `invalidateIdentity()`) must keep failing the call.
 */
async function anonymousIfAgentIs(
  agent: Pick<Agent, "getPrincipal">
): Promise<AnonymousIdentity | undefined> {
  try {
    const principal = await agent.getPrincipal()
    return principal.isAnonymous() ? new AnonymousIdentity() : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a TanStack Query `retry` value retries after `failureCount`
 * failures, read the way TanStack Query reads it. Unset, it is TanStack
 * Query's own default: three retries in a browser, none on a server.
 */
function retriesAgain(
  retry: QueryOptions["retry"],
  failureCount: number,
  error: unknown
): boolean {
  if (retry === undefined) {
    return typeof window !== "undefined" && failureCount < 3
  }
  if (typeof retry === "function") return retry(failureCount, error as never)
  if (typeof retry === "number") return failureCount < retry
  return retry
}

/**
 * The agents calls have named through `callConfig.agent`, each with the number
 * its query keys carry. A key has to serialise and hash, which an agent does
 * not, so the key holds the number instead of the agent. The map is weak so a
 * dropped agent can still be collected.
 *
 * A registry counts up from a random start rather than from 1. A key leaves
 * its process when a server's cache is dehydrated into the page, or a cache
 * is persisted and restored in a later session, and two registries counting
 * from 1 give their first agents the same number: the entry the server fetched
 * through its override agent answered the browser's first override agent,
 * whoever that agent signs as. From random starts, two registries' numbers
 * practically never meet, so such an entry is simply not found.
 *
 * The registry sits behind a global symbol, like the error brands, so every
 * copy of this package in one app numbers agents from the same sequence, and
 * two reactors on one QueryClient never share an entry between two agents.
 * Where the global object cannot take the property (a frozen global), this
 * copy keeps its own registry instead, from a start of its own.
 */
const AGENT_ORDINALS = Symbol.for("@ic-reactor/core/agentOrdinals")

interface AgentOrdinals {
  readonly byAgent: WeakMap<Agent, number>
  next: number
}

let ownAgentOrdinals: AgentOrdinals | undefined

/**
 * Where a registry starts counting: a random integer from 1 to 2^48, which
 * leaves the numbers exact however many agents a long-running server numbers
 * after it.
 */
const firstAgentOrdinal = (): number => Math.floor(Math.random() * 2 ** 48) + 1

/** The registry of {@link AGENT_ORDINALS}, created on first use. */
function agentOrdinals(): AgentOrdinals {
  const global = globalThis as { [AGENT_ORDINALS]?: AgentOrdinals }
  const shared = global[AGENT_ORDINALS]
  if (shared) return shared
  ownAgentOrdinals ??= { byAgent: new WeakMap(), next: firstAgentOrdinal() }
  try {
    global[AGENT_ORDINALS] = ownAgentOrdinals
  } catch {
    // A frozen global: number the agents in this copy alone.
  }
  return ownAgentOrdinals
}

/** The number query keys carry for `agent`; see {@link AGENT_ORDINALS}. */
function agentOrdinal(agent: Agent): number {
  const registry = agentOrdinals()
  let ordinal = registry.byAgent.get(agent)
  if (ordinal === undefined) {
    ordinal = registry.next++
    registry.byAgent.set(agent, ordinal)
  }
  return ordinal
}

/**
 * Reactor class for interacting with IC canisters.
 *
 * This class provides core functionality for:
 * - Direct agent calls using agent.call() and agent.query()
 * - Query caching with TanStack Query integration
 * - Method calls with result unwrapping
 *
 * @typeParam A - The actor service type
 * @typeParam T - The type transformation to apply (default: candid = raw Candid types)
 */
export class Reactor<A = BaseActor, T extends TransformKey = "candid"> {
  /** Phantom type brand for inference - never assigned at runtime */
  declare readonly _actor: A
  public readonly transform: TransformKey = "candid"
  public clientManager: ClientManager
  public name: string
  public canisterId: Principal
  public service: IDL.ServiceClass
  public pollingOptions: PollingOptions
  /**
   * The reactors {@link forCanister} made, by canister id. A reactor and
   * every sibling it made share one map, so each canister has one reactor
   * across the family, whichever member was asked.
   */
  private siblings?: Map<string, Reactor<A, T>>

  constructor(config: ReactorParameters) {
    this.clientManager = config.clientManager
    this.name = config.name
    this.pollingOptions =
      "pollingOptions" in config && config.pollingOptions
        ? config.pollingOptions
        : DEFAULT_POLLING_OPTIONS

    const { idlFactory } = config
    if (!idlFactory) {
      throw new Error(`[ic-reactor] idlFactory is missing for ${this.name}`)
    }

    let canisterId = config.canisterId

    if (!canisterId) {
      const key = `PUBLIC_CANISTER_ID:${this.name}`
      // The ic_env cookie is not origin-isolated: any sibling subdomain of the
      // registrable domain can write it. Taking the canister ID from it
      // unconditionally let such a subdomain substitute the canister every
      // read and every authenticated update call is routed to -- fake balances
      // and deposit addresses on the way out, the user's signed calls on the
      // way in -- and certificate verification cannot notice, because the
      // attacker names a real canister whose responses verify against the same
      // mainnet root key. The root key and the Internet Identity provider are
      // read from this cookie too and were already guarded; this is the third
      // value, and it was the unguarded one (#348).
      const inBrowser = typeof window !== "undefined"
      const hostTrusted = this.clientManager.trustsEnvConfig
      canisterId =
        inBrowser && hostTrusted ? safeGetCanisterEnv()?.[key] : undefined

      if (!canisterId) {
        // Three different problems with three different fixes. Reporting a
        // refused cookie as an absent one sends the reader hunting for a cookie
        // that is sitting right there, and reporting a server render as a
        // refused host blames the host for having no cookie jar.
        throw new Error(
          `[ic-reactor] canisterId is required for "${this.name}" but was not provided ` +
            (!inBrowser
              ? `and there is no ic_env cookie to read outside a browser. `
              : !hostTrusted
                ? `and the ic_env cookie is not trusted for this agent's host ` +
                  `(${this.clientManager.agentHost?.toString() ?? "unknown"}` +
                  // The agent host is often the library's mainnet fallback rather
                  // than anywhere the reader recognises, so name the page too.
                  `${window.location?.origin ? `, page ${window.location.origin}` : ""}), ` +
                  `so it was not read. ` +
                  `The cookie is only trusted for a local replica, because any sibling subdomain can write it. ` +
                  `Bake the id in at build time (the codegen \`canisterId\` option), or, only if you trust every subdomain of ` +
                  `this domain, pass \`allowEnvConfig: true\` to ClientManager — that trusts the whole cookie, its root key included. `
                : `and could not be resolved from the ic_env cookie (key: "${key}"). `) +
            `Pass canisterId explicitly in the reactor configuration.`
        )
      }
    }

    this.canisterId = Principal.from(canisterId)
    this.service = idlFactory({ IDL })

    // Register this canister ID for delegation during login
    this.clientManager.registerCanisterId(this.canisterId.toString(), this.name)
  }

  /**
   * Set the canister ID for this reactor.
   * Useful for dynamically switching between canisters of the same type (e.g., multiple ICRC tokens).
   *
   * @param canisterId - The new canister ID (as string or Principal)
   *
   * @example
   * ```typescript
   * // Switch to a different ledger canister
   * ledgerReactor.setCanisterId("ryjl3-tyaaa-aaaaa-aaaba-cai")
   *
   * // Then use queries/mutations as normal
   * const { data } = icrc1NameQuery.useQuery()
   * ```
   */
  public setCanisterId(canisterId: CanisterId): void {
    this.canisterId = Principal.from(canisterId)
    // Register the new canister ID for delegation
    this.clientManager.registerCanisterId(this.canisterId.toString(), this.name)
  }

  /**
   * Set the canister name for this reactor.
   * Useful for dynamically switching between canisters of the same type (e.g., multiple ICRC tokens).
   *
   * @param name - The new canister name
   *
   * @example
   * ```typescript
   * // Switch to a different ledger canister
   * ledgerReactor.setCanisterName("icrc1")
   *
   * // Then use queries/mutations as normal
   * const { data } = icrc1NameQuery.useQuery()
   * ```
   */
  public setCanisterName(name: string): void {
    this.name = name
  }

  /**
   * A reactor of the same class for another canister of the same interface,
   * such as another ICRC ledger. It shares this reactor's `ClientManager`
   * (so its agent, identity and `QueryClient`), name and polling options. It
   * starts from the interface, transform and validators this reactor has
   * when it is made. Only the canister differs.
   *
   * The same canister id always gives the same reactor, so it is safe to
   * call during render and as a dependency of `useMemo`. The siblings of a
   * reactor share that memo: `a.forCanister(x).forCanister(y)` is
   * `a.forCanister(y)`. The result is a separate reactor even for this
   * reactor's own canister, and it keeps its canister when this one's
   * `setCanisterId` moves.
   *
   * Use one sibling per canister instead of retargeting a shared reactor
   * with {@link setCanisterId}. Their query keys start with their own
   * canister, so several tokens' queries live side by side in the cache,
   * and no call or retry of one is sent to another. A mutation invalidates
   * its own canister's queries. Never `setCanisterId` a sibling: ask for the
   * other canister's instead.
   *
   * A subclass whose constructor takes options of its own passes them on by
   * overriding the protected `siblingParameters(canisterId)`.
   *
   * @param canisterId - The other canister, as text or a `Principal`.
   *
   * @example
   * ```typescript
   * const ledger = new DisplayReactor<Ledger>({
   *   clientManager,
   *   idlFactory,
   *   name: "ledger",
   *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", // ICP
   * })
   *
   * // ckBTC, through the same agent, cache and interface
   * const ckbtc = ledger.forCanister("mxzaz-hqaaa-aaaar-qaada-cai")
   * const symbol = await ckbtc.fetchQuery({ functionName: "icrc1_symbol" })
   *
   * // In React: one set of hooks per token, memoized by its canister
   * const hooks = useMemo(
   *   () => createActorHooks(ledger.forCanister(tokenId)),
   *   [tokenId]
   * )
   * ```
   */
  public forCanister(canisterId: CanisterId): this {
    const id = Principal.from(canisterId).toText()
    const siblings = (this.siblings ??= new Map())
    let sibling = siblings.get(id)
    if (!sibling) {
      // The class this reactor was made with, so a DisplayReactor's sibling
      // is a DisplayReactor, and a subclass's is that subclass.
      const Sibling = this.constructor as new (
        config: ReactorParameters
      ) => Reactor<A, T>
      sibling = new Sibling(this.siblingParameters(Principal.fromText(id)))
      sibling.siblings = siblings
      siblings.set(id, sibling)
    }
    return sibling as this
  }

  /**
   * The constructor options {@link forCanister} makes a sibling with: this
   * reactor's `ClientManager`, name and polling options, the sibling's
   * `canisterId`, and an `idlFactory` that gives a copy of the service this
   * reactor has now. The copy is the sibling's own: a candid package reactor
   * that registers a method or re-reads its interface later changes its own
   * service, not a sibling's, which could not call the method without the
   * codecs and metadata built for it.
   *
   * A subclass whose constructor takes more adds it to what this returns,
   * as `DisplayReactor` adds its validators.
   *
   * @param canisterId - The sibling's canister.
   */
  protected siblingParameters(canisterId: Principal): ReactorParameters {
    // A method typed by a recursive func alias is an `IDL.Rec`, which the
    // service holds as it is, like a plain `IDL.Func`.
    const methods = Object.fromEntries(this.service._fields) as Record<
      string,
      IDL.FuncClass
    >
    return {
      clientManager: this.clientManager,
      name: this.name,
      canisterId,
      idlFactory: () => IDL.Service(methods),
      pollingOptions: this.pollingOptions,
    }
  }

  protected verifyCanister() {
    // Optional: add any verification logic here
  }

  /**
   * Get the service interface (IDL.ServiceClass) for this reactor.
   * Useful for introspection and codec generation.
   * @returns The service interface
   */
  public getServiceInterface(): IDL.ServiceClass {
    return this.service
  }

  /**
   * Get the function class for a specific method.
   * @param methodName - The name of the method
   * @returns The function class or null if not found
   */
  protected getFuncClass<M extends FunctionName<A>>(
    methodName: M
  ): IDL.FuncClass | null {
    const field = this.service._fields.find(([name]) => name === methodName)
    if (!field) return null
    // A method typed by a recursive func alias (`type f = func (f) -> (f)`)
    // is an `IDL.Rec` wrapping the func. The wrapper has no `argTypes`,
    // `retTypes` or `annotations`, so every caller that read them off it
    // failed, and `isQueryMethod` threw instead of answering.
    let type: IDL.Type | undefined = field[1]
    while (type instanceof IDL.RecClass) type = type.getType()
    return type instanceof IDL.FuncClass ? type : null
  }

  /**
   * Check if a method is a query method (query or composite_query).
   */
  public isQueryMethod<M extends FunctionName<A>>(methodName: M): boolean {
    const func = this.getFuncClass(methodName)
    if (!func) return false
    return (
      func.annotations.includes("query") ||
      func.annotations.includes("composite_query")
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // TRANSFORMATION METHODS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Transform arguments before calling the method.
   * Default implementation returns arguments as-is.
   */
  protected transformArgs<M extends FunctionName<A>>(
    _methodName: M,
    args?: ReactorArgs<A, M, T>
  ): ActorMethodParameters<A[M]> {
    if (!args) {
      return [] as unknown as ActorMethodParameters<A[M]>
    }
    return args as ActorMethodParameters<A[M]>
  }

  /**
   * Transform the result after calling the method.
   * Default implementation extracts Ok value from Result types.
   */
  protected transformResult<M extends FunctionName<A>>(
    _methodName: M,
    result: ActorMethodReturnType<A[M]>
  ): ReactorReturnOk<A, M, T> {
    return extractOkResult(result) as ReactorReturnOk<A, M, T>
  }

  // ══════════════════════════════════════════════════════════════════════
  // QUERY KEY GENERATION
  // ══════════════════════════════════════════════════════════════════════

  public generateQueryKey<M extends FunctionName<A>>(
    params: ReactorQueryParams<A, M, T>,
    callConfig?: CallConfig
  ): QueryKey {
    const resolvedCanisterId = callConfig?.canisterId
      ? Principal.from(callConfig.canisterId).toString()
      : this.canisterId.toString()

    // A `callConfig.canisterId` override roots the key at a canister the client was
    // never told about, so it would be missed by the canister-scoped cancel and
    // invalidate in ClientManager.updateAgent and stay cached under the old identity.
    // Registering here keeps that registry complete. Registration is idempotent.
    if (callConfig?.canisterId) {
      this.clientManager.registerCanisterId(resolvedCanisterId)
    }

    const queryKeys: any[] = [resolvedCanisterId, params.functionName]

    // Two reactors over the same canister return differently-shaped data when
    // their transforms differ (a DisplayReactor's string nats vs a Reactor's
    // bigints), so they must not share a cache entry. Only non-default
    // transforms add a segment, which keeps existing candid keys byte-identical.
    // It sits before the args segment so that the prefix built by
    // `invalidateQueries({ functionName })` still matches keys that carry args.
    if (this.transform !== "candid") {
      queryKeys.push({ transform: this.transform })
    }

    // A query sent through another agent is answered for that agent's
    // identity or network, so it must not share an entry with the same query
    // sent through the manager's agent. It did: whichever ran first answered
    // both, and a `whoami` or a balance of self came back for the wrong
    // principal (#642). Only an agent other than the manager's adds the
    // segment, so every other key keeps its exact bytes, and it sits before
    // the args for the same prefix-matching reason as the transform segment.
    const agent = callConfig?.agent
    if (agent && agent !== this.clientManager.agent) {
      queryKeys.push({ agent: agentOrdinal(agent) })
    }

    const effectiveTarget =
      callConfig?.effectiveTarget ??
      (callConfig?.effectiveCanisterId
        ? { canisterId: callConfig.effectiveCanisterId }
        : undefined)

    if (effectiveTarget) {
      const targetKey =
        "canisterId" in effectiveTarget
          ? { canisterId: effectiveTarget.canisterId.toString() }
          : { subnetId: effectiveTarget.subnetId.toString() }

      if (
        !("canisterId" in targetKey) ||
        targetKey.canisterId !== resolvedCanisterId
      ) {
        queryKeys.push({ effectiveTarget: targetKey })
      }
    }

    if (params.args) {
      const argKey = generateKey(
        this.argsForQueryKey(params.functionName, params.args)
      )
      queryKeys.push(argKey)
    }
    if (params.queryKey) {
      // Caller-supplied segments are hashed by React Query with JSON.stringify,
      // which throws on a BigInt. Args and factory key-args are already routed
      // through a BigInt-safe serializer; do the same here so a natural key like
      // `queryKey: [tokenId]` cannot blank the component tree.
      queryKeys.push(...params.queryKey.map(toHashableKeySegment))
    }

    return queryKeys
  }

  /**
   * The args as the query key records them: each blob the method's Candid
   * type declares is keyed by its bytes, so a `Uint8Array` and a `number[]`
   * holding the same bytes get one key. A record's undeclared fields are left
   * out and a `reserved` value is keyed as `null`, since neither is sent, and
   * a value IDL.encode refuses is keyed behind a tag, apart from every value
   * it takes. Every other value is unchanged. A subclass whose
   * `transformArgs` takes other shapes reads them here too.
   */
  protected argsForQueryKey<M extends FunctionName<A>>(
    functionName: M,
    args: ReactorArgs<A, M, T>
  ): unknown[] {
    const func = this.getFuncClass(functionName)
    return func ? candidArgsKey.keyArgs(func.argTypes, args) : args
  }

  // ══════════════════════════════════════════════════════════════════════
  // QUERY OPTIONS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * The `retry` a TanStack query of `functionName`, cached under `queryKey`,
   * runs with when the query sets no `retry` of its own.
   *
   * For a query method it is `undefined`, and the QueryClient's `retry`
   * defaults apply as usual.
   *
   * An update method runs on the canister again each time the query function
   * runs, as a new call the IC cannot tell from a retry, so a retry after a
   * lost response executed the update a second time. For one it is a function
   * that retries only a failure proving the canister never ran the call, a
   * SysTransient rejection (see `isRetryableUpdateError`), and only as often
   * as the QueryClient's `retry` default for `queryKey` would: its
   * `setQueryDefaults` or `defaultOptions.queries`, or TanStack Query's own
   * three retries in a browser when neither sets one. With the QueryClient
   * `defineReactor` creates, that is `reactorUpdateRetry`, and with a default
   * of `retry: false` nothing is retried. A transport failure, a SysUnknown
   * rejection and an HTTP error are not retried. Refetches on mount, window
   * focus, reconnect and invalidation still run the method again.
   *
   * {@link getQueryOptions}, {@link fetchQuery} and the query hooks and
   * factories of `@ic-reactor/react` apply it, and a `retry` the query sets
   * itself wins over it.
   *
   * @param functionName - The method the query calls.
   * @param queryKey - The query's key, which selects its QueryClient defaults.
   */
  public getQueryRetry<M extends FunctionName<A>>(
    functionName: M,
    queryKey: QueryKey
  ): ((failureCount: number, error: unknown) => boolean) | undefined {
    if (this.isQueryMethod(functionName)) return undefined
    return (failureCount, error) => {
      if (!isRetryableUpdateError(error)) return false
      // Read when a retry is due, so the QueryClient's defaults of the moment
      // decide, as they do for a query method.
      const { queryClient } = this
      const retry =
        queryClient.getQueryDefaults(queryKey).retry ??
        queryClient.getDefaultOptions().queries?.retry
      return retriesAgain(retry, failureCount, error)
    }
  }

  /**
   * The key and function of a TanStack query of the method, for
   * `queryClient.fetchQuery`, `prefetchQuery` or `useQuery`. For an update
   * method they also hold the `retry` from {@link getQueryRetry}; spread a
   * `retry` of your own after them to replace it.
   */
  public getQueryOptions<M extends FunctionName<A>>(
    params: ReactorCallParams<A, M, T>
  ): FetchQueryOptions<ReactorQueryData<ReactorReturnOk<A, M, T>>> {
    // The key names the canister `this.canisterId` holds right now, so the
    // query function has to fetch from that same canister rather than read
    // `this.canisterId` again whenever it runs. After a `setCanisterId`, a
    // TanStack retry or a refetch of an observer that has not been re-keyed
    // re-runs this function, and it used to fetch the new canister and cache
    // its answer under the old canister's key. An explicit override wins, as
    // it does in `generateQueryKey`.
    const callConfig: CallConfig = {
      ...params.callConfig,
      canisterId: params.callConfig?.canisterId || this.canisterId,
    }

    const queryKey = this.generateQueryKey(params, params.callConfig)
    const retry = this.getQueryRetry(params.functionName, queryKey)

    return {
      queryKey,
      queryFn: async () => {
        const result = await this.callMethod({ ...params, callConfig })
        return toReactorQueryData<ReactorReturnOk<A, M, T>>(
          result as ReactorReturnOk<A, M, T>
        )
      },
      // Left out for a query method: even as `undefined` it would replace the
      // QueryClient's `retry` default.
      ...(retry ? { retry } : {}),
    }
  }

  /**
   * Invalidate cached queries for this canister.
   * This will mark matching queries as stale and trigger a refetch for any active queries.
   *
   * It returns TanStack Query's promise, which resolves once the active
   * queries it matched have refetched. A refetch that fails does not reject
   * it. Await it where the next step should read the refetched data, such as
   * in a mutation's `onSuccess`; an arrow that returns it, like
   * `onSuccess: () => reactor.invalidateQueries(...)`, keeps the mutation
   * pending until those refetches finish.
   *
   * @param params - Optional parameters to filter the invalidation. Without a
   * `functionName`, every query of the canister is invalidated.
   * @param callConfig - Optional call configuration. Its `canisterId` selects
   * which canister's queries are invalidated, as it does for the calls.
   *
   * @example
   * ```typescript
   * // Invalidate all queries for this canister, and wait for the active
   * // ones to refetch
   * await reactor.invalidateQueries()
   *
   * // Invalidate only 'getUser' queries
   * reactor.invalidateQueries({ functionName: 'getUser' })
   *
   * // Invalidate 'getUser' query for specific user
   * reactor.invalidateQueries({ functionName: 'getUser', args: ['user-1'] })
   *
   * // Invalidate all queries of a canister reached through an override
   * reactor.invalidateQueries(undefined, { canisterId: otherLedgerId })
   * ```
   */
  public invalidateQueries<M extends FunctionName<A>>(
    params?: Partial<ReactorQueryParams<A, M, T>>,
    callConfig?: CallConfig
  ): Promise<void> {
    // Without a method there is nothing narrower than the canister to match
    // on: a key built with an undefined functionName matches no entry at all,
    // since TanStack compares prefix segments one by one. The canister is the
    // one `callConfig` names, exactly as in `generateQueryKey`.
    const queryKey =
      params?.functionName !== undefined
        ? this.generateQueryKey(
            {
              functionName: params.functionName,
              args: params.args,
              queryKey: params.queryKey,
            },
            callConfig
          )
        : [
            callConfig?.canisterId
              ? Principal.from(callConfig.canisterId).toString()
              : this.canisterId.toString(),
          ]

    // Returned rather than dropped, so a caller can wait for the refetches.
    // It used to be `void`, and awaiting the call waited for nothing.
    return this.queryClient.invalidateQueries({ queryKey })
  }

  // ══════════════════════════════════════════════════════════════════════
  // METHOD CALLS - Using agent.call() and agent.query() directly
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Call a canister method directly using agent.call() or agent.query().
   * This is the recommended approach for interacting with canisters.
   *
   * @example
   * ```typescript
   * // Query method
   * const result = await reactor.callMethod({
   *   functionName: 'greet',
   *   args: ['world'],
   * });
   *
   * // Update method with options
   * const result = await reactor.callMethod({
   *   functionName: 'transfer',
   *   args: [{ to: principal, amount: 100n }],
   *   callConfig: { effectiveCanisterId: principal },
   * });
   * ```
   */
  public async callMethod<M extends FunctionName<A>>(
    params: Omit<ReactorCallParams<A, M, T>, "queryKey">
  ): Promise<ReactorReturnOk<A, M, T>> {
    try {
      const func = this.getFuncClass(params.functionName)
      if (!func) {
        throw new Error(`Method ${String(params.functionName)} not found`)
      }

      // Transform args
      const transformedArgs = this.transformArgs(
        params.functionName,
        params.args
      )

      // Encode arguments using Candid
      const arg = IDL.encode(func.argTypes, transformedArgs)

      // Determine if this is a query or update call
      const isQuery =
        func.annotations.includes("query") ||
        func.annotations.includes("composite_query")

      // Execute the call
      let rawResponse: Uint8Array
      if (isQuery) {
        rawResponse = await this.executeQuery(
          String(params.functionName),
          arg,
          params.callConfig
        )
      } else {
        rawResponse = await this.executeCall(
          String(params.functionName),
          arg,
          params.callConfig
        )
      }

      // Decode the result
      const decoded = IDL.decode(func.retTypes, rawResponse)

      // Handle single, zero, and multiple return values appropriately
      const response = (
        decoded.length === 0
          ? undefined
          : decoded.length === 1
            ? decoded[0]
            : decoded
      ) as ActorMethodReturnType<A[M]>

      return this.transformResult(params.functionName, response)
    } catch (error) {
      // Re-throw CanisterError as-is (business logic error from canister), and
      // a ValidationError or a CallError, which are already reactor errors: a
      // DisplayReactor reports a validator that threw as a CallError, and
      // wrapping it again would bury what the validator threw one `cause`
      // deeper than `validate()` and `callMethodWithValidation()` put it.
      // The guards also know these errors from another copy of this package,
      // such as a ValidationError a validator built against that copy throws.
      if (
        isCanisterError(error) ||
        isValidationError(error) ||
        isCallError(error)
      ) {
        throw error
      }

      const message = `Failed to call method "${String(params.functionName)}": `

      // Wrap other errors in CallError (network/agent issues)
      if (error instanceof Error) {
        throw new CallError(message + error.message, error)
      }

      throw new CallError(message + String(error), error)
    }
  }

  /**
   * Returns the cached value for the call, or fetches and caches it when there
   * is none. Like TanStack Query's `ensureQueryData`, it is cache-first: a
   * cached value is returned even when it is stale or was invalidated, and a
   * `staleTime` in `options` has no effect. For a value the canister returns
   * now, use {@link callMethod}, or `queryClient.fetchQuery` with the options
   * from {@link getQueryOptions} inside
   * {@link ClientManager.fetchAcrossIdentitySwitch}, which keeps a sign-in or
   * sign-out from resolving it with the previous principal's cached data.
   *
   * A sign-in or sign-out while the fetch is in flight cancels it, so the
   * previous identity's answer is never cached. The fetch then runs again for
   * the identity installed now and resolves with that answer, rather than
   * rejecting with TanStack's `CancelledError`; see
   * {@link ClientManager.fetchAcrossIdentitySwitch}.
   *
   * @param options - Further TanStack Query options for the fetch, such as
   * `retry`, `networkMode` or `meta`. The query key and function always come
   * from `params`. The query factories pass their config's options through
   * here, so a subclass that overrides this method still sees their fetches.
   * Without a `retry` here, an update method retries as
   * {@link getQueryRetry} says.
   */
  public async fetchQuery<M extends FunctionName<A>>(
    params: ReactorCallParams<A, M, T>,
    options?: Omit<
      FetchQueryOptions<
        ReactorQueryData<ReactorReturnOk<A, M, T>>,
        ReactorReturnErr<A, M, T>
      >,
      "queryKey" | "queryFn"
    >
  ): Promise<ReactorQueryData<ReactorReturnOk<A, M, T>>> {
    // Only the key and the function come from `getQueryOptions`. Spreading
    // its whole return type mixed in option types keyed to TanStack's default
    // `Error` rather than this method's error type, which stops type-checking
    // as soon as the reactor's error classes grow a member.
    const { queryKey, queryFn, retry } = this.getQueryOptions(params)
    // `updateAgent` cancels a fetch in flight when the principal changes. It
    // used to reject with TanStack's CancelledError, an error type no reactor
    // call documents, so a route loader running during a sign-out showed its
    // error boundary. It now runs again for the new identity.
    return this.clientManager.fetchAcrossIdentitySwitch(() =>
      this.queryClient.ensureQueryData<
        ReactorQueryData<ReactorReturnOk<A, M, T>>,
        ReactorReturnErr<A, M, T>
      >({
        ...options,
        // The update method's default, unless the caller set a `retry`.
        ...(retry !== undefined && options?.retry === undefined
          ? { retry }
          : {}),
        queryKey,
        queryFn,
      })
    )
  }

  /**
   * Get the current data from the cache without fetching.
   */
  public getQueryData<M extends FunctionName<A>>(
    params: ReactorQueryParams<A, M, T>,
    callConfig?: CallConfig
  ): ReactorQueryData<ReactorReturnOk<A, M, T>> | undefined {
    const queryKey = this.generateQueryKey(params, callConfig)
    return this.queryClient.getQueryData<
      ReactorQueryData<ReactorReturnOk<A, M, T>>
    >(queryKey)
  }

  /**
   * Execute a query call using agent.query()
   */
  protected async executeQuery(
    methodName: string,
    arg: Uint8Array,
    callConfig?: CallConfig
  ): Promise<Uint8Array> {
    const agent = callConfig?.agent ?? this.clientManager.agent
    const canisterId = callConfig?.canisterId
      ? Principal.from(callConfig.canisterId)
      : this.canisterId
    const effectiveTarget =
      callConfig?.effectiveTarget ??
      (callConfig?.effectiveCanisterId
        ? { canisterId: callConfig.effectiveCanisterId }
        : { canisterId })

    const response = await agent.query(canisterId, {
      methodName,
      arg,
      effectiveTarget,
    })

    return processQueryCallResponse(response, canisterId, methodName)
  }

  /**
   * Execute an update call using agent.call()
   */
  protected async executeCall(
    methodName: string,
    arg: Uint8Array,
    callConfig?: CallConfig
  ): Promise<Uint8Array> {
    const agent = callConfig?.agent ?? this.clientManager.agent
    const canisterId = callConfig?.canisterId
      ? Principal.from(callConfig.canisterId)
      : this.canisterId
    const effectiveTarget =
      callConfig?.effectiveTarget ??
      (callConfig?.effectiveCanisterId
        ? { canisterId: callConfig.effectiveCanisterId }
        : { canisterId })
    const pollingOptions = callConfig?.pollingOptions ?? this.pollingOptions

    // Pin the call to the identity installed right now. `updateAgent` mutates
    // the shared agent in place — deliberately, so retained Actors and
    // transforms keep working — which used to mean a sign-in or sign-out
    // part-way through re-signed the read_state of a call that had already been
    // submitted, and the replica answered 403 for a call that had committed.
    //
    // Before the first `updateAgent` nothing is installed, and the agent signs
    // as whatever it holds: usually the anonymous identity it starts with, as
    // `AuthenticationManager` leaves an anonymous session off the agent. A
    // call submitted then went unpinned, so the first sign-in of every visitor
    // could still re-sign its polls. While the agent is anonymous, a fresh
    // `AnonymousIdentity` signs exactly as it does, so the call is pinned to
    // one. Any other identity it holds cannot be read back, and is left as is.
    const identity = callConfig?.agent
      ? undefined
      : (this.clientManager.identity ?? (await anonymousIfAgentIs(agent)))

    const callOptions = {
      methodName,
      arg,
      effectiveTarget,
      nonce: callConfig?.nonce,
    }
    // Only widen the call when there is something to pin, so an agent supplied
    // through `callConfig` keeps being invoked exactly as before.
    const response = identity
      ? await agent.call(canisterId, callOptions, identity)
      : await agent.call(canisterId, callOptions)

    return await processUpdateCallResponse(
      response,
      canisterId,
      methodName,
      agent,
      pollingOptions,
      effectiveTarget,
      identity
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUBNET
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Get the subnet ID for this canister.
   */
  public async subnetId() {
    return this.clientManager.agent.getSubnetIdFromCanister(this.canisterId)
  }

  /**
   * Get the subnet state for this canister.
   */
  public async subnetState(options: ReadStateOptions) {
    const subnetId = await this.subnetId()
    return this.clientManager.agent.readSubnetState(subnetId, options)
  }

  // ══════════════════════════════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Get the query client from clientManager.
   * This is the recommended way to access the query client for direct queries.
   */
  get queryClient() {
    return this.clientManager.queryClient
  }

  /**
   * Get the agent from clientManager.
   * This is the recommended way to access the agent for direct calls.
   */
  get agent() {
    return this.clientManager.agent
  }
}
