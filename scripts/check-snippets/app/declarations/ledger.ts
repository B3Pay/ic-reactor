// An ICRC-1 ledger, `./declarations/ledger`, as its generated declarations
// type it.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"

export type Subaccount = Uint8Array
export interface Account {
  owner: Principal
  subaccount: [] | [Subaccount]
}
export interface TransferArg {
  to: Account
  fee: [] | [bigint]
  memo: [] | [Uint8Array]
  from_subaccount: [] | [Subaccount]
  created_at_time: [] | [bigint]
  amount: bigint
}
export type TransferError =
  | { GenericError: { message: string; error_code: bigint } }
  | { TemporarilyUnavailable: null }
  | { BadBurn: { min_burn_amount: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { BadFee: { expected_fee: bigint } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { TooOld: null }
  | { InsufficientFunds: { balance: bigint } }
export type TransferResult = { Ok: bigint } | { Err: TransferError }
export type MetadataValue =
  { Int: bigint } | { Nat: bigint } | { Blob: Uint8Array } | { Text: string }

export interface _SERVICE {
  icrc1_balance_of: ActorMethod<[Account], bigint>
  icrc1_decimals: ActorMethod<[], number>
  icrc1_fee: ActorMethod<[], bigint>
  icrc1_metadata: ActorMethod<[], Array<[string, MetadataValue]>>
  icrc1_minting_account: ActorMethod<[], [] | [Account]>
  icrc1_name: ActorMethod<[], string>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_total_supply: ActorMethod<[], bigint>
  icrc1_transfer: ActorMethod<[TransferArg], TransferResult>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
