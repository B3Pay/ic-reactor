import type { BaseActor, DisplayReactorParameters } from "@ic-reactor/core"
import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types"

import {
  DisplayReactor,
  didToDisplayCodec,
  didTypeFromArray,
} from "@ic-reactor/core"
import { CandidAdapter } from "./adapter"
import { IDL } from "@icp-sdk/core/candid"

// ============================================================================
// CandidDisplayReactor
// ============================================================================

/**
 * CandidDisplayReactor combines the display transformation capabilities of
 * DisplayReactor with dynamic Candid parsing from CandidReactor.
 *
 * This class provides:
 * - **Display transformations**: Automatic type conversion between Candid and
 *   display-friendly types (bigint ↔ string, Principal ↔ string, etc.)
 * - **Validation**: Optional argument validation with display types
 * - **Dynamic Candid parsing**: Initialize from Candid source or fetch from network
 * - **Dynamic method registration**: Register methods at runtime with Candid signatures
 *
 * @typeParam A - The actor service type
 *
 * @example
 * ```typescript
 * import { CandidDisplayReactor } from "@ic-reactor/candid"
 *
 * const reactor = new CandidDisplayReactor({
 *   clientManager,
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 * })
 *
 * // Initialize from network (fetches Candid from canister)
 * await reactor.initialize()
 *
 * // Or provide Candid source directly
 * const reactor2 = new CandidDisplayReactor({
 *   clientManager,
 *   canisterId: "...",
 *   candid: `service : { greet : (text) -> (text) query }`
 * })
 * await reactor2.initialize()
 *
 * // Call methods with display types (strings instead of bigint/Principal)
 * const result = await reactor.callMethod({
 *   functionName: "transfer",
 *   args: [{ to: "aaaaa-aa", amount: "1000000" }] // strings!
 * })
 *
 * // Add validation
 * reactor.registerValidator("transfer", ([input]) => {
 *   if (!input.to) {
 *     return { success: false, issues: [{ path: ["to"], message: "Required" }] }
 *   }
 *   return { success: true }
 * })
 * ```
 */
export class CandidDisplayReactor<A = BaseActor> extends DisplayReactor<A> {
  public adapter: CandidAdapter
  private candidSource?: string

  constructor(config: CandidDisplayReactorParameters<A>) {
    const superConfig = { ...config }

    if (!superConfig.idlFactory) {
      superConfig.idlFactory = ({ IDL }) => IDL.Service({})
    }

    super(superConfig as DisplayReactorParameters<A>)

    this.candidSource = config.candid

    if (config.adapter) {
      this.adapter = config.adapter
    } else {
      this.adapter = new CandidAdapter({
        clientManager: this.clientManager,
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initializes the reactor by parsing the provided Candid string or fetching it from the network.
   * This updates the internal service definition with the actual canister interface.
   *
   * After initialization, all DisplayReactor methods work with display type transformations.
   *
   * @example
   * ```typescript
   * const reactor = new CandidDisplayReactor({
   *   clientManager,
   *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
   * })
   *
   * // Fetches Candid from the canister and initializes
   * await reactor.initialize()
   *
   * // Now you can call methods with display types
   * const balance = await reactor.callMethod({
   *   functionName: "icrc1_balance_of",
   *   args: [{ owner: "aaaaa-aa" }] // Principal as string!
   * })
   * ```
   */
  public async initialize(): Promise<void> {
    let idlFactory: IDL.InterfaceFactory

    if (this.candidSource) {
      const definition = await this.adapter.parseCandidSource(this.candidSource)
      idlFactory = definition.idlFactory
    } else {
      const definition = await this.adapter.getCandidDefinition(this.canisterId)
      idlFactory = definition.idlFactory
    }

    this.service = idlFactory({ IDL })

    // Re-initialize codecs after service is updated
    this.reinitializeCodecs()
  }

  /**
   * Re-initialize the display codecs after the service has been updated.
   * This is called automatically after initialize() or registerMethod().
   */
  private reinitializeCodecs(): void {
    const fields = this.getServiceInterface()?._fields
    if (!fields) return

    // Access the private codecs map from DisplayReactor
    const codecs = (this as any).codecs as Map<
      string,
      { args: any; result: any }
    >

    for (const [methodName, funcType] of fields) {
      // Skip if already exists
      if (codecs.has(methodName)) continue

      const argsIdlType = didTypeFromArray(funcType.argTypes)
      const retIdlType = didTypeFromArray(funcType.retTypes)

      codecs.set(methodName, {
        args: didToDisplayCodec(argsIdlType),
        result: didToDisplayCodec(retIdlType),
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC METHOD REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a dynamic method by its Candid signature.
   * After registration, all DisplayReactor methods work with display type transformations.
   *
   * @example
   * ```typescript
   * // Register a method
   * await reactor.registerMethod({
   *   functionName: "icrc1_balance_of",
   *   candid: "(record { owner : principal }) -> (nat) query"
   * })
   *
   * // Now use with display types!
   * const balance = await reactor.callMethod({
   *   functionName: "icrc1_balance_of",
   *   args: [{ owner: "aaaaa-aa" }] // Principal as string
   * })
   * // balance is string (not bigint) due to display transformation
   * ```
   */
  public async registerMethod(options: DynamicMethodOptions): Promise<void> {
    const { functionName, candid } = options

    // Check if method already registered
    const existing = this.service._fields.find(
      ([name]) => name === functionName
    )
    if (existing) return

    // Parse the Candid signature
    const serviceSource = candid.includes("service :")
      ? candid
      : `service : { ${functionName} : ${candid}; }`

    const { idlFactory } = await this.adapter.parseCandidSource(serviceSource)
    const parsedService = idlFactory({ IDL })

    const funcField = parsedService._fields.find(
      ([name]) => name === functionName
    )
    if (!funcField) {
      throw new Error(
        `Method "${functionName}" not found in the provided Candid signature`
      )
    }

    // Inject into our service
    this.service._fields.push(funcField)

    // Re-initialize codecs for the new method
    this.reinitializeCodecs()
  }

  /**
   * Register multiple methods at once.
   *
   * @example
   * ```typescript
   * await reactor.registerMethods([
   *   { functionName: "icrc1_balance_of", candid: "(record { owner : principal }) -> (nat) query" },
   *   { functionName: "icrc1_transfer", candid: "(record { to : principal; amount : nat }) -> (variant { Ok : nat; Err : text })" }
   * ])
   * ```
   */
  public async registerMethods(methods: DynamicMethodOptions[]): Promise<void> {
    await Promise.all(methods.map((m) => this.registerMethod(m)))
  }

  /**
   * Check if a method is registered (either from initialize or registerMethod).
   */
  public hasMethod(functionName: string): boolean {
    return this.service._fields.some(([name]) => name === functionName)
  }

  /**
   * Get all registered method names.
   */
  public getMethodNames(): string[] {
    return this.service._fields.map(([name]) => name)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC CALL SHORTCUTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Perform a dynamic update call in one step with display type transformations.
   * Registers the method if not already registered, then calls it.
   *
   * @example
   * ```typescript
   * const result = await reactor.callDynamic({
   *   functionName: "transfer",
   *   candid: "(record { to : principal; amount : nat }) -> (variant { Ok : nat; Err : text })",
   *   args: [{ to: "aaaaa-aa", amount: "100" }] // Display types!
   * })
   * ```
   */
  public async callDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    await this.registerMethod(options)
    return this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    }) as T
  }

  /**
   * Perform a dynamic query call in one step with display type transformations.
   * Registers the method if not already registered, then calls it.
   *
   * @example
   * ```typescript
   * const balance = await reactor.queryDynamic({
   *   functionName: "icrc1_balance_of",
   *   candid: "(record { owner : principal }) -> (nat) query",
   *   args: [{ owner: "aaaaa-aa" }] // Display types!
   * })
   * // balance is string (not BigInt)
   * ```
   */
  public async queryDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    await this.registerMethod(options)
    return this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    }) as T
  }

  /**
   * Fetch with dynamic Candid and TanStack Query caching.
   * Registers the method if not already registered, then fetches with caching.
   * Results are transformed to display types.
   *
   * @example
   * ```typescript
   * const balance = await reactor.fetchQueryDynamic({
   *   functionName: "icrc1_balance_of",
   *   candid: "(record { owner : principal }) -> (nat) query",
   *   args: [{ owner: "aaaaa-aa" }]
   * })
   * // Subsequent calls with same args return cached result
   * ```
   */
  public async fetchQueryDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    await this.registerMethod(options)
    return this.fetchQuery({
      functionName: options.functionName as any,
      args: options.args as any,
    }) as T
  }
}
