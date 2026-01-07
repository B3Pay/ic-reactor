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
    const { func, args } = await this.parseDynamicOptions(options)
    const rawResult = await this.executeCall(
      options.functionName,
      IDL.encode(func.argTypes, args)
    )
    return this.decodeResult<T>(func.retTypes, rawResult)
  }

  /**
   * Performs a query call to the canister using a Candid signature.
   */
  public async queryDynamic<T = unknown>(options: CallOptions): Promise<T> {
    const { func, args } = await this.parseDynamicOptions(options)
    const rawResult = await this.executeQuery(
      options.functionName,
      IDL.encode(func.argTypes, args)
    )
    return this.decodeResult<T>(func.retTypes, rawResult)
  }

  /**
   * Parse CallOptions to extract the IDL function type and arguments.
   */
  private async parseDynamicOptions({
    functionName,
    candid,
    args = [],
  }: CallOptions) {
    const serviceSource = candid.includes("service :")
      ? candid
      : `service : { ${functionName} : ${candid}; }`

    const { idlFactory } = await this.adapter.parseCandidSource(serviceSource)
    const service = idlFactory({ IDL })

    const funcField = service._fields.find(([name]) => name === functionName)
    if (!funcField) {
      throw new Error(
        `Method "${functionName}" not found in the provided Candid signature`
      )
    }

    return { func: funcField[1], args }
  }

  /**
   * Decode raw result bytes using IDL types.
   */
  private decodeResult<T>(retTypes: IDL.Type[], rawResult: Uint8Array): T {
    const decoded = IDL.decode(retTypes, rawResult)
    if (decoded.length === 0) return undefined as T
    if (decoded.length === 1) return decoded[0] as T
    return decoded as T
  }
}
