import type {
  CallConfig,
  PollingOptions,
  ReadStateOptions,
} from "@icp-sdk/core/agent"
import type { ClientManager } from "./client"
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
  ReactorQueryParams,
  ReactorCallParams,
  CanisterId,
} from "./types/reactor"

import { DEFAULT_POLLING_OPTIONS } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { generateKey, extractOkResult } from "./utils/helper"
import {
  processQueryCallResponse,
  processUpdateCallResponse,
} from "./utils/agent"
import { CallError, CanisterError, ValidationError } from "./errors"
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
      const env = safeGetCanisterEnv()
      const key = `PUBLIC_CANISTER_ID:${this.name}`
      canisterId = env?.[key]

      if (!canisterId) {
        console.warn(
          `[ic-reactor] ${this.name} canister ID not found in ic_env cookie`
        )
        canisterId = "aaaaa-aa" // Fallback
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
    params: ReactorQueryParams<A, M, T>
  ): QueryKey {
    const queryKeys: any[] = [this.canisterId.toString(), params.functionName]

    if (params.args) {
      const argKey = generateKey(params.args)
      queryKeys.push(argKey)
    }
    if (params.queryKey) {
      queryKeys.push(...params.queryKey)
    }

    return queryKeys
  }

  // ══════════════════════════════════════════════════════════════════════
  // QUERY OPTIONS
  // ══════════════════════════════════════════════════════════════════════

  public getQueryOptions<M extends FunctionName<A>>(
    params: ReactorCallParams<A, M, T>
  ): FetchQueryOptions<ReactorReturnOk<A, M, T>> {
    return {
      queryKey: this.generateQueryKey(params),
      queryFn: async () => {
        return await this.callMethod(params)
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
    params?: Partial<ReactorQueryParams<A, M, T>>
  ) {
    const queryKey = params
      ? this.generateQueryKey({
          functionName: params.functionName as M,
          args: params.args,
          queryKey: params.queryKey,
        })
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
  ): Promise<ReactorReturnOk<A, M, T>> {
    const options = this.getQueryOptions(params)
    return this.queryClient.ensureQueryData<ReactorReturnOk<A, M, T>>(options)
  }

  /**
   * Get the current data from the cache without fetching.
   */
  public getQueryData<M extends FunctionName<A>>(
    params: ReactorQueryParams<A, M, T>
  ): ReactorReturnOk<A, M, T> | undefined {
    const queryKey = this.generateQueryKey(params)
    return this.queryClient.getQueryData<ReactorReturnOk<A, M, T>>(queryKey)
  }

  /**
   * Execute a query call using agent.query()
   */
  protected async executeQuery(
    methodName: string,
    arg: Uint8Array,
    callConfig?: CallConfig
  ): Promise<Uint8Array> {
    const agent = this.clientManager.agent
    const effectiveCanisterId =
      callConfig?.effectiveCanisterId ?? this.canisterId

    const response = await agent.query(this.canisterId, {
      methodName,
      arg,
      effectiveCanisterId,
    })

    return processQueryCallResponse(response, this.canisterId, methodName)
  }

  /**
   * Execute an update call using agent.call()
   */
  protected async executeCall(
    methodName: string,
    arg: Uint8Array,
    callConfig?: CallConfig
  ): Promise<Uint8Array> {
    const agent = this.clientManager.agent

    const response = await agent.call(this.canisterId, {
      methodName,
      arg,
      effectiveCanisterId: callConfig?.effectiveCanisterId,
      nonce: callConfig?.nonce,
    })

    return await processUpdateCallResponse(
      response,
      this.canisterId,
      methodName,
      agent,
      this.pollingOptions
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
