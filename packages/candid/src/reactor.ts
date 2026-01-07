import { Reactor } from "@ic-reactor/core"
import { CandidAdapter } from "./adapter"
import { IDL } from "@icp-sdk/core/candid"

import type { CanisterId } from "./types"
import type { BaseActor, ReactorParameters } from "@ic-reactor/core"

export interface CandidReactorParameters<A = BaseActor> extends Omit<
  ReactorParameters<A>,
  "idlFactory" | "actor"
> {
  canisterId: CanisterId
  candid?: string
  idlFactory?: IDL.InterfaceFactory
  actor?: A
}

export interface DynamicMethodOptions {
  /** The method name to register. */
  functionName: string
  /**
   * The Candid signature for the method.
   * Can be either a method signature like "(text) -> (text) query"
   * or a full service definition like "service : { greet: (text) -> (text) query }".
   */
  candid: string
}

export class CandidReactor<A = BaseActor> extends Reactor<A> {
  public adapter: CandidAdapter
  private candidSource?: string

  constructor(config: CandidReactorParameters<A>) {
    // If idlFactory/actor are missing, use a dummy one to satisfy Reactor constructor
    const superConfig = { ...config }

    if (!superConfig.idlFactory && !superConfig.actor) {
      superConfig.idlFactory = (config: { IDL: any }) => config.IDL.Service({})
    }

    super(superConfig as ReactorParameters<A>)

    this.candidSource = config.candid
    this.adapter = new CandidAdapter({
      clientManager: this.clientManager,
    })
  }

  /**
   * Initializes the reactor by parsing the provided Candid string or fetching it from the network.
   * This updates the internal service definition with the actual canister interface.
   *
   * After initialization, all standard Reactor methods (callMethod, fetchQuery, etc.) work.
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
  }

  /**
   * Register a dynamic method by its Candid signature.
   * After registration, all standard Reactor methods work with this method name.
   *
   * @example
   * ```typescript
   * // Register a method
   * await reactor.registerMethod({
   *   functionName: "icrc1_balance_of",
   *   candid: "(record { owner : principal }) -> (nat) query"
   * })
   *
   * // Now use standard Reactor methods!
   * const balance = await reactor.callMethod({
   *   functionName: "icrc1_balance_of",
   *   args: [{ owner }]
   * })
   *
   * // Or with caching
   * const cachedBalance = await reactor.fetchQuery({
   *   functionName: "icrc1_balance_of",
   *   args: [{ owner }]
   * })
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
  }

  /**
   * Register multiple methods at once.
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
}
