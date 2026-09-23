import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types.js"
import { CandidAdapter } from "./adapter.js"
import { normalizeCandidInterface } from "./utils.js"

import {
  BaseActor,
  DisplayReactorParameters,
  TransformKey,
  DisplayReactor,
  didToDisplayCodec,
  didTypeFromArray,
} from "@ic-reactor/core"
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
 *   name: "ledger",
 *   clientManager,
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 * })
 *
 * // Initialize from network (fetches Candid from canister)
 * await reactor.initialize()
 *
 * // Or provide Candid source directly
 * const reactor2 = new CandidDisplayReactor({
 *   name: "greeter",
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
 * // Add validation. Without a service type the validator gets `unknown`
 * // args, so name the display shape it checks.
 * reactor.registerValidator("transfer", (args) => {
 *   const [input] = args as [{ to: string; amount: string }]
 *   if (!input.to) {
 *     return { success: false, issues: [{ path: ["to"], message: "Required" }] }
 *   }
 *   return { success: true }
 * })
 * ```
 */
export class CandidDisplayReactor<
  A = BaseActor,
  T extends TransformKey = "display",
> extends DisplayReactor<A, T> {
  public readonly transform = "display" as T
  public adapter: CandidAdapter
  private candidSource?: string

  constructor(config: CandidDisplayReactorParameters<A>) {
    const superConfig = { ...config }

    // If funcClass is provided, build an idlFactory from it
    if (config.funcClass && !superConfig.idlFactory) {
      const { methodName, func } = config.funcClass
      superConfig.idlFactory = ({ IDL }) => IDL.Service({ [methodName]: func })
    }

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
   *   name: "ledger",
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

    // The service was replaced wholesale, and a codec is a snapshot of one
    // signature: it has to be rebuilt for every method, or a method that
    // changed shape — a `funcClass` that disagrees with the fetched interface,
    // a `registerMethod` guess corrected here, a canister upgraded between two
    // calls to initialize() — keeps transforming args and results against the
    // old signature while getServiceInterface() reports the new one.
    this.reinitializeCodecs({ rebuild: true })
  }

  /**
   * Re-initialize the display codecs after the service has been updated.
   * This is called automatically after initialize() or registerMethod().
   *
   * By default only methods without a codec get one, which is what the
   * additive `registerMethod` path needs. `rebuild` drops every existing codec
   * first, for when the whole service has been replaced.
   */
  private reinitializeCodecs({ rebuild = false } = {}): void {
    const fields = this.getServiceInterface()?._fields
    if (!fields) return

    // Access the private codecs map from DisplayReactor
    const codecs = (this as any).codecs as Map<
      string,
      { args: any; result: any }
    >

    if (rebuild) codecs.clear()

    for (const [methodName, methodType] of fields) {
      // Skip if already exists
      if (codecs.has(methodName)) continue

      // A method typed by a recursive func alias (`type f = func (f) -> (f)`)
      // is an `IDL.Rec` wrapping the func, with no `argTypes` of its own, as
      // in core's DisplayReactor. Each method on its own, so one codec that
      // cannot be built does not fail `initialize()` for the whole service.
      let funcType: IDL.Type | undefined = methodType
      while (funcType instanceof IDL.RecClass) funcType = funcType.getType()
      if (!(funcType instanceof IDL.FuncClass)) {
        console.error(
          `Failed to initialize codecs for ${methodName}:`,
          new Error(`${methodType.display()} is not a function type`)
        )
        continue
      }

      try {
        codecs.set(methodName, {
          args: didToDisplayCodec(didTypeFromArray(funcType.argTypes)),
          result: didToDisplayCodec(didTypeFromArray(funcType.retTypes)),
        })
      } catch (error) {
        console.error(`Failed to initialize codecs for ${methodName}:`, error)
      }
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

    // Build the service source the way CandidReactor does. Both take the same
    // options, so type definitions ahead of the signature, a trailing
    // semicolon and a method name that needs quoting work here too.
    const serviceSource = candid.includes("service :")
      ? candid
      : normalizeCandidInterface(candid, functionName)

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

    // Checked again after the await. registerMethods() runs its calls in
    // parallel, so two registrations of one name both passed the check above
    // and both pushed, leaving the name twice in getMethodNames(). The first to
    // finish wins, as the first call does for a sequential repeat.
    if (this.hasMethod(functionName)) return

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
