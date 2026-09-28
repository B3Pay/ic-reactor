// `./declarations/minter` of the ckBTC wallet: the methods of the ckBTC minter
// the page's snippets call.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"

export interface UpdateBalanceArgs {
  owner: [] | [Principal]
  subaccount: [] | [Uint8Array]
}
export type UpdateBalanceError =
  | { GenericError: { error_message: string; error_code: bigint } }
  | { TemporarilyUnavailable: string }
  | { AlreadyProcessing: null }
  | { NoNewUtxos: { required_confirmations: number } }
export type UpdateBalanceResult =
  | { Ok: Array<{ Minted: { minted_amount: bigint } }> }
  | { Err: UpdateBalanceError }

export interface _SERVICE {
  get_btc_address: ActorMethod<[UpdateBalanceArgs], string>
  update_balance: ActorMethod<[UpdateBalanceArgs], UpdateBalanceResult>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
