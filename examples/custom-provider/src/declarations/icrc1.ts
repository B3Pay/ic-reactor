import type { Principal } from "@dfinity/principal"
import type { ActorMethod } from "@dfinity/agent"

export interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array | number[]]
}

export interface TransferArg {
  to: Account
  fee: [] | [bigint]
  memo: [] | [Uint8Array | number[]]
  from_subaccount: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
}

export interface StandardRecord {
  url: string
  name: string
}

export type TransferError =
  | {
      GenericError: { message: string; error_code: bigint }
    }
  | { TemporarilyUnavailable: null }
  | { BadBurn: { min_burn_amount: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { BadFee: { expected_fee: bigint } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { TooOld: null }
  | { InsufficientFunds: { balance: bigint } }

export type Result = { Ok: bigint } | { Err: TransferError }

export type MetadataValue =
  | { Int: bigint }
  | { Nat: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }

export interface ICRC1 {
  icrc1_balance_of: ActorMethod<[Account], bigint>
  icrc1_decimals: ActorMethod<[], number>
  icrc1_fee: ActorMethod<[], bigint>
  icrc1_metadata: ActorMethod<[], Array<[string, MetadataValue]>>
  icrc1_minting_account: ActorMethod<[], [] | [Account]>
  icrc1_name: ActorMethod<[], string>
  icrc1_supported_standards: ActorMethod<[], Array<StandardRecord>>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_total_supply: ActorMethod<[], bigint>
  icrc1_transfer: ActorMethod<[TransferArg], Result>
}
