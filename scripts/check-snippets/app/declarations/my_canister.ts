// `./declarations/my_canister`, the canister of the root README and of the
// core README.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import type { Account, TransferError } from "./ledger"

export interface Profile {
  name: string
}
export interface User {
  id: string
  name: string
}

export interface _SERVICE {
  greet: ActorMethod<[string], string>
  get_profile: ActorMethod<[], Profile>
  update_profile: ActorMethod<[Profile], undefined>
  get_data: ActorMethod<[], string>
  get_user: ActorMethod<[string], User>
  my_method: ActorMethod<[string, bigint], undefined>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: TransferError }
  >
  icrc1_balance_of: ActorMethod<[Account], bigint>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "rrkah-fqaaa-aaaaa-aaaaq-cai"
