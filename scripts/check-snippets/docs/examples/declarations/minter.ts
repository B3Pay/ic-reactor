// `./declarations/minter` of the ckBTC wallet: the methods of the ckBTC minter
// the page's snippets call, with the types they use as the wallet's own
// `src/declarations/minter.ts` declares them (`UtxoStatus`, `NoNewUtxos`, ...).
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"

export interface UpdateBalanceArgs {
  owner: [] | [Principal]
  subaccount: [] | [Uint8Array | number[]]
}
export interface PendingUtxo {
  confirmations: number
  value: bigint
  outpoint: { txid: Uint8Array | number[]; vout: number }
}
export type UpdateBalanceError =
  | { GenericError: { error_message: string; error_code: bigint } }
  | { TemporarilyUnavailable: string }
  | { AlreadyProcessing: null }
  | {
      NoNewUtxos: {
        required_confirmations: number
        pending_utxos: [] | [Array<PendingUtxo>]
        current_confirmations: [] | [number]
      }
    }
export interface Utxo {
  height: number
  value: bigint
  outpoint: { txid: Uint8Array | number[]; vout: number }
}
export type UtxoStatus =
  | { ValueTooSmall: Utxo }
  | { Tainted: Utxo }
  | {
      Minted: {
        minted_amount: bigint
        block_index: bigint
        utxo: Utxo
      }
    }
  | { Checked: Utxo }
export type UpdateBalanceResult =
  { Ok: Array<UtxoStatus> } | { Err: UpdateBalanceError }

export interface _SERVICE {
  get_btc_address: ActorMethod<[UpdateBalanceArgs], string>
  update_balance: ActorMethod<[UpdateBalanceArgs], UpdateBalanceResult>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
