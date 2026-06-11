import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface _SERVICE {
  get_counter: ActorMethod<[], bigint>
  get_message: ActorMethod<[], [] | [string]>
  /**
   * Query methods (fast, read-only)
   */
  greet: ActorMethod<[string], string>
  increment: ActorMethod<[], bigint>
  /**
   * Update methods (slower, can modify state)
   */
  set_message: ActorMethod<[string], undefined>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
