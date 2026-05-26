import type { Principal } from "@dfinity/principal"
import type { ActorMethod } from "@dfinity/agent"
import type { IDL } from "@dfinity/candid"

export interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array | number[]]
}
export interface _SERVICE {
  icrc1_name: ActorMethod<[], string>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_decimals: ActorMethod<[], number>
  icrc1_total_supply: ActorMethod<[], bigint>
  icrc1_fee: ActorMethod<[], bigint>
  icrc1_balance_of: ActorMethod<[Account], bigint>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const canisterId: string
export declare const info: _SERVICE
