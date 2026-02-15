import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface _SERVICE {
  getCount: ActorMethod<[], bigint>
  greet: ActorMethod<[string], string>
  increment: ActorMethod<[], bigint>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
