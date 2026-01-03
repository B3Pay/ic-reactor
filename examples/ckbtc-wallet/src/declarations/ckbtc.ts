import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Account {
  owner: Principal
  subaccount: [] | [Uint8Array | number[]]
}
export interface Allowance {
  from_account: Account
  to_spender: Account
  allowance: bigint
  expires_at: [] | [bigint]
}
export interface AllowanceArgs {
  account: Account
  spender: Account
}
export interface Allowance_1 {
  allowance: bigint
  expires_at: [] | [bigint]
}
export interface Approve {
  fee: [] | [bigint]
  from: Account
  memo: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
  expected_allowance: [] | [bigint]
  expires_at: [] | [bigint]
  spender: Account
}
export interface ApproveArgs {
  fee: [] | [bigint]
  memo: [] | [Uint8Array | number[]]
  from_subaccount: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
  expected_allowance: [] | [bigint]
  expires_at: [] | [bigint]
  spender: Account
}
export type ApproveError =
  | {
      GenericError: { message: string; error_code: bigint }
    }
  | { TemporarilyUnavailable: null }
  | { Duplicate: { duplicate_of: bigint } }
  | { BadFee: { expected_fee: bigint } }
  | { AllowanceChanged: { current_allowance: bigint } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { TooOld: null }
  | { Expired: { ledger_time: bigint } }
  | { InsufficientFunds: { balance: bigint } }
export interface ArchiveInfo {
  block_range_end: bigint
  canister_id: Principal
  block_range_start: bigint
}
export interface ArchiveOptions {
  num_blocks_to_archive: bigint
  max_transactions_per_response: [] | [bigint]
  trigger_threshold: bigint
  more_controller_ids: [] | [Array<Principal>]
  max_message_size_bytes: [] | [bigint]
  cycles_for_archive_creation: [] | [bigint]
  node_max_memory_size_bytes: [] | [bigint]
  controller_id: Principal
}
export interface ArchivedBlocks {
  args: Array<GetBlocksRequest>
  callback: [Principal, string]
}
export interface ArchivedRange {
  callback: [Principal, string]
  start: bigint
  length: bigint
}
export interface ArchivedRange_1 {
  callback: [Principal, string]
  start: bigint
  length: bigint
}
export interface BlockRange {
  blocks: Array<Value>
}
export interface BlockWithId {
  id: bigint
  block: ICRC3Value
}
export interface Burn {
  from: Account
  memo: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
  spender: [] | [Account]
}
export interface ChangeArchiveOptions {
  num_blocks_to_archive: [] | [bigint]
  max_transactions_per_response: [] | [bigint]
  trigger_threshold: [] | [bigint]
  more_controller_ids: [] | [Array<Principal>]
  max_message_size_bytes: [] | [bigint]
  cycles_for_archive_creation: [] | [bigint]
  node_max_memory_size_bytes: [] | [bigint]
  controller_id: [] | [Principal]
}
export type ChangeFeeCollector = { SetTo: Account } | { Unset: null }
export interface ConsentInfo {
  metadata: ConsentMessageMetadata
  consent_message: ConsentMessage
}
export type ConsentMessage =
  | { FieldsDisplayMessage: FieldsDisplay }
  | { GenericDisplayMessage: string }
export interface ConsentMessageMetadata {
  utc_offset_minutes: [] | [number]
  language: string
}
export interface ConsentMessageRequest {
  arg: Uint8Array | number[]
  method: string
  user_preferences: ConsentMessageSpec
}
export interface ConsentMessageSpec {
  metadata: ConsentMessageMetadata
  device_spec: [] | [DisplayMessageType]
}
export interface DataCertificate {
  certificate: [] | [Uint8Array | number[]]
  hash_tree: Uint8Array | number[]
}
export type DisplayMessageType =
  | { GenericDisplay: null }
  | { FieldsDisplay: null }
export interface ErrorInfo {
  description: string
}
export interface FeatureFlags {
  icrc2: boolean
}
export interface FieldsDisplay {
  fields: Array<[string, Value_1]>
  intent: string
}
export interface GetAllowancesArgs {
  take: [] | [bigint]
  prev_spender: [] | [Account]
  from_account: [] | [Account]
}
export type GetAllowancesError =
  | {
      GenericError: { message: string; error_code: bigint }
    }
  | { AccessDenied: { reason: string } }
export interface GetArchivesArgs {
  from: [] | [Principal]
}
export interface GetBlocksRequest {
  start: bigint
  length: bigint
}
export interface GetBlocksResponse {
  certificate: [] | [Uint8Array | number[]]
  first_index: bigint
  blocks: Array<Value>
  chain_length: bigint
  archived_blocks: Array<ArchivedRange>
}
export interface GetBlocksResult {
  log_length: bigint
  blocks: Array<BlockWithId>
  archived_blocks: Array<ArchivedBlocks>
}
export interface GetTransactionsResponse {
  first_index: bigint
  log_length: bigint
  transactions: Array<Transaction>
  archived_transactions: Array<ArchivedRange_1>
}
export interface ICRC3ArchiveInfo {
  end: bigint
  canister_id: Principal
  start: bigint
}
export interface ICRC3DataCertificate {
  certificate: Uint8Array | number[]
  hash_tree: Uint8Array | number[]
}
export type ICRC3Value =
  | { Int: bigint }
  | { Map: Array<[string, ICRC3Value]> }
  | { Nat: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Array: Array<ICRC3Value> }
export type Icrc106Error =
  | {
      GenericError: { description: string; error_code: bigint }
    }
  | { IndexPrincipalNotSet: null }
export type Icrc21Error =
  | {
      GenericError: { description: string; error_code: bigint }
    }
  | { InsufficientPayment: ErrorInfo }
  | { UnsupportedCanisterCall: ErrorInfo }
  | { ConsentMessageUnavailable: ErrorInfo }
export interface InitArgs {
  decimals: [] | [number]
  token_symbol: string
  transfer_fee: bigint
  metadata: Array<[string, MetadataValue]>
  minting_account: Account
  initial_balances: Array<[Account, bigint]>
  fee_collector_account: [] | [Account]
  archive_options: ArchiveOptions
  max_memo_length: [] | [number]
  index_principal: [] | [Principal]
  token_name: string
  feature_flags: [] | [FeatureFlags]
}
export type LedgerArgument =
  | { Upgrade: [] | [UpgradeArgs] }
  | { Init: InitArgs }
export type MetadataValue =
  | { Int: bigint }
  | { Nat: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
export interface Mint {
  to: Account
  memo: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
}
export type Result = { Ok: Array<Allowance> } | { Err: GetAllowancesError }
export type Result_1 = { Ok: Principal } | { Err: Icrc106Error }
export type Result_2 = { Ok: bigint } | { Err: TransferError }
export type Result_3 = { Ok: ConsentInfo } | { Err: Icrc21Error }
export type Result_4 = { Ok: bigint } | { Err: ApproveError }
export type Result_5 = { Ok: bigint } | { Err: TransferFromError }
export interface StandardRecord {
  url: string
  name: string
}
export interface SupportedBlockType {
  url: string
  block_type: string
}
export interface Transaction {
  burn: [] | [Burn]
  kind: string
  mint: [] | [Mint]
  approve: [] | [Approve]
  timestamp: bigint
  transfer: [] | [Transfer]
}
export interface TransactionRange {
  transactions: Array<Transaction>
}
export interface Transfer {
  to: Account
  fee: [] | [bigint]
  from: Account
  memo: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
  spender: [] | [Account]
}
export interface TransferArg {
  to: Account
  fee: [] | [bigint]
  memo: [] | [Uint8Array | number[]]
  from_subaccount: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
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
export interface TransferFromArgs {
  to: Account
  fee: [] | [bigint]
  spender_subaccount: [] | [Uint8Array | number[]]
  from: Account
  memo: [] | [Uint8Array | number[]]
  created_at_time: [] | [bigint]
  amount: bigint
}
export type TransferFromError =
  | {
      GenericError: { message: string; error_code: bigint }
    }
  | { TemporarilyUnavailable: null }
  | { InsufficientAllowance: { allowance: bigint } }
  | { BadBurn: { min_burn_amount: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { BadFee: { expected_fee: bigint } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { TooOld: null }
  | { InsufficientFunds: { balance: bigint } }
export interface UpgradeArgs {
  change_archive_options: [] | [ChangeArchiveOptions]
  token_symbol: [] | [string]
  transfer_fee: [] | [bigint]
  metadata: [] | [Array<[string, MetadataValue]>]
  change_fee_collector: [] | [ChangeFeeCollector]
  max_memo_length: [] | [number]
  index_principal: [] | [Principal]
  token_name: [] | [string]
  feature_flags: [] | [FeatureFlags]
}
export type Value =
  | { Int: bigint }
  | { Map: Array<[string, Value]> }
  | { Nat: bigint }
  | { Nat64: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Array: Vec }
export type Value_1 =
  | { Text: { content: string } }
  | {
      TokenAmount: {
        decimals: number
        amount: bigint
        symbol: string
      }
    }
  | { TimestampSeconds: { amount: bigint } }
  | { DurationSeconds: { amount: bigint } }
export type Vec = Array<
  | { Int: bigint }
  | { Map: Array<[string, Value]> }
  | { Nat: bigint }
  | { Nat64: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Array: Vec }
>
export interface _SERVICE {
  archives: ActorMethod<[], Array<ArchiveInfo>>
  get_blocks: ActorMethod<[GetBlocksRequest], GetBlocksResponse>
  get_data_certificate: ActorMethod<[], DataCertificate>
  get_transactions: ActorMethod<[GetBlocksRequest], GetTransactionsResponse>
  icrc103_get_allowances: ActorMethod<[GetAllowancesArgs], Result>
  icrc106_get_index_principal: ActorMethod<[], Result_1>
  icrc10_supported_standards: ActorMethod<[], Array<StandardRecord>>
  icrc1_balance_of: ActorMethod<[Account], bigint>
  icrc1_decimals: ActorMethod<[], number>
  icrc1_fee: ActorMethod<[], bigint>
  icrc1_metadata: ActorMethod<[], Array<[string, MetadataValue]>>
  icrc1_minting_account: ActorMethod<[], [] | [Account]>
  icrc1_name: ActorMethod<[], string>
  icrc1_supported_standards: ActorMethod<[], Array<StandardRecord>>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_total_supply: ActorMethod<[], bigint>
  icrc1_transfer: ActorMethod<[TransferArg], Result_2>
  icrc21_canister_call_consent_message: ActorMethod<
    [ConsentMessageRequest],
    Result_3
  >
  icrc2_allowance: ActorMethod<[AllowanceArgs], Allowance_1>
  icrc2_approve: ActorMethod<[ApproveArgs], Result_4>
  icrc2_transfer_from: ActorMethod<[TransferFromArgs], Result_5>
  icrc3_get_archives: ActorMethod<[GetArchivesArgs], Array<ICRC3ArchiveInfo>>
  icrc3_get_blocks: ActorMethod<[Array<GetBlocksRequest>], GetBlocksResult>
  icrc3_get_tip_certificate: ActorMethod<[], [] | [ICRC3DataCertificate]>
  icrc3_supported_block_types: ActorMethod<[], Array<SupportedBlockType>>
  is_ledger_ready: ActorMethod<[], boolean>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
