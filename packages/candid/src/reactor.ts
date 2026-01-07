import { Reactor } from "@ic-reactor/core"
import { CandidAdapter } from "./adapter"
import type { CallOptions } from "./types"
import { Actor } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import type { BaseActor, ReactorParameters } from "@ic-reactor/core"

export interface CandidReactorParameters<A = BaseActor> extends Omit<
  ReactorParameters<A>,
  "idlFactory" | "actor"
> {
  idlFactory?: IDL.InterfaceFactory
  actor?: A
}

export class CandidReactor<A = BaseActor> extends Reactor<A> {
  public adapter: CandidAdapter

  constructor(config: CandidReactorParameters<A>) {
    // If idlFactory/actor are missing, use a dummy one to satisfy Reactor constructor
    const superConfig = { ...config } as ReactorParameters<A>

    if (!superConfig.idlFactory && !superConfig.actor) {
      superConfig.idlFactory = ({ IDL }) => IDL.Service({})
    }

    super(superConfig)

    this.adapter = new CandidAdapter({
      clientManager: this.clientManager,
    })
  }

  /**
   * Initializes the reactor by fetching the Candid definition from the network.
   * This updates the internal service definition with the actual canister interface.
   */
  public async initialize(): Promise<void> {
    const { idlFactory } = await this.adapter.getCandidDefinition(
      this.canisterId
    )
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
    _mode: "call" | "query",
    { methodName, candid, args = [] }: CallOptions
  ): Promise<T> {
    let serviceSource = candid
    if (!candid.includes("service :")) {
      serviceSource = `service : { ${methodName} : ${candid}; }`
    }

    const definition = await this.adapter.parseCandidSource(serviceSource)

    const actor = Actor.createActor(definition.idlFactory, {
      agent: this.agent,
      canisterId: this.canisterId,
    })

    if (!(methodName in actor)) {
      throw new Error(
        `Method ${methodName} not found in the provided Candid signature`
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (actor[methodName] as any)(...args)
  }
}
