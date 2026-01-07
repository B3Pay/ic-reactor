import { Reactor } from "@ic-reactor/core"
import { CandidAdapter } from "./adapter"
import { IDL } from "@icp-sdk/core/candid"

import type { CallOptions, CanisterId } from "./types"
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
   */
  public async initialize(): Promise<void> {
    let idlFactory: IDL.InterfaceFactory

    if (this.candidSource) {
      // Use provided Candid string
      const definition = await this.adapter.parseCandidSource(this.candidSource)
      idlFactory = definition.idlFactory
    } else {
      // Fetch from network
      const definition = await this.adapter.getCandidDefinition(this.canisterId)
      idlFactory = definition.idlFactory
    }

    this.service = idlFactory({ IDL })
  }

  /**
   * Performs an update call to the canister using a Candid signature.
   */
  public async callDynamic<T = unknown>(options: CallOptions): Promise<T> {
    return this._executeDynamicMethod("call", options)
  }

  /**
   * Performs a query call to the canister using a Candid signature.
   */
  public async queryDynamic<T = unknown>(options: CallOptions): Promise<T> {
    return this._executeDynamicMethod("query", options)
  }

  private async _executeDynamicMethod<T>(
    mode: "call" | "query",
    { functionName, candid, args = [] }: CallOptions
  ): Promise<T> {
    // 1. Construct service definition if needed
    let serviceSource = candid
    if (!candid.includes("service :")) {
      serviceSource = `service : { ${functionName} : ${candid}; }`
    }

    // 2. Parse Candid to get IDL types
    const definition = await this.adapter.parseCandidSource(serviceSource)
    const service = definition.idlFactory({ IDL })

    // 3. Get the function type
    const funcField = service._fields.find(([name]) => name === functionName)
    if (!funcField) {
      throw new Error(
        `Method ${functionName} not found in the provided Candid signature`
      )
    }
    const func = funcField[1]

    // 4. Encode arguments
    const encodedArgs = IDL.encode(func.argTypes, args)

    // 5. Execute using parent's methods
    let rawResult: Uint8Array
    if (mode === "query") {
      rawResult = await this.executeQuery(functionName, encodedArgs)
    } else {
      rawResult = await this.executeCall(functionName, encodedArgs)
    }

    // 6. Decode result
    const decoded = IDL.decode(func.retTypes, rawResult)

    // Handle single, zero, and multiple return values
    return (
      decoded.length === 0
        ? undefined
        : decoded.length === 1
          ? decoded[0]
          : decoded
    ) as T
  }
}
