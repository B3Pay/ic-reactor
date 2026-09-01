import type {
  CallConfig,
  PollingOptions,
  ReadStateOptions,
} from "@icp-sdk/core/agent"
import type { ClientManager } from "./client.js"
import type { QueryKey, FetchQueryOptions } from "@tanstack/query-core"
import type {
  ReactorParameters,
  BaseActor,
  ActorMethodParameters,
  ActorMethodReturnType,
  FunctionName,
  TransformKey,
  ReactorArgs,
  ReactorReturnOk,
  ReactorQueryData,
  ReactorQueryParams,
  ReactorCallParams,
  CanisterId,
} from "./types/reactor.js"

import { DEFAULT_POLLING_OPTIONS } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import {
  generateKey,
  extractOkResult,
  toHashableKeySegment,
} from "./utils/helper.js"
import { toReactorQueryData } from "./utils/query-data.js"
import {
  processQueryCallResponse,
  processUpdateCallResponse,
} from "./utils/agent.js"
import { CallError, CanisterError, ValidationError } from "./errors/index.js"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"

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
                  `(${this.clientManager.agentHost?.toString() ?? "unknown"}), so it was not read. ` +
                  `The cookie is only trusted for a local replica, because any sibling subdomain can write it; ` +
                  `bake the id in at build time, or pass \`allowEnvConfig: true\` to ClientManager if you trust every subdomain of this domain. `
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
    return field ? field[1] : null
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
      const argKey = generateKey(params.args)
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
  // ══════════════════════════════════════════════════════════════════════
  // QUERY OPTIONS
  // ══════════════════════════════════════════════════════════════════════

  public getQueryOptions<M extends FunctionName<A>>(
    params: ReactorCallParams<A, M, T>
  ): FetchQueryOptions<ReactorQueryData<ReactorReturnOk<A, M, T>>> {
    return {
      queryKey: this.generateQueryKey(params, params.callConfig),
      queryFn: async () => {
        const result = await this.callMethod(params)
        return toReactorQueryData<ReactorReturnOk<A, M, T>>(
          result as ReactorReturnOk<A, M, T>
        )
      },
    }
  }

  /**
   * Invalidate cached queries for this canister.
   * This will mark matching queries as stale and trigger a refetch for any active queries.
   *
   * @param params - Optional parameters to filter the invalidation
   *
   * @example
   * ```typescript
   * // Invalidate all queries for this canister
   * reactor.invalidateQueries()
   *
   * // Invalidate only 'getUser' queries
   * reactor.invalidateQueries({ functionName: 'getUser' })
   *
   * // Invalidate 'getUser' query for specific user
   * reactor.invalidateQueries({ functionName: 'getUser', args: ['user-1'] })
   * ```
   */
  public invalidateQueries<M extends FunctionName<A>>(
    params?: Partial<ReactorQueryParams<A, M, T>>,
    callConfig?: CallConfig
  ) {
    const queryKey = params
      ? this.generateQueryKey(
          {
            functionName: params.functionName as M,
            args: params.args,
            queryKey: params.queryKey,
          },
          callConfig
        )
      : [this.canisterId.toString()]

    this.queryClient.invalidateQueries({
      queryKey,
    })
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
      // Re-throw CanisterError as-is (business logic error from canister)
      if (error instanceof CanisterError || error instanceof ValidationError) {
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
   * Fetch data from the canister and cache it using React Query.
   * This method ensures the data is in the cache and returns it.
   */
  public async fetchQuery<M extends FunctionName<A>>(
    params: ReactorCallParams<A, M, T>
  ): Promise<ReactorQueryData<ReactorReturnOk<A, M, T>>> {
    const options = this.getQueryOptions(params)
    return this.queryClient.ensureQueryData<
      ReactorQueryData<ReactorReturnOk<A, M, T>>
    >(options)
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
    const identity = callConfig?.agent ? undefined : this.clientManager.identity

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
