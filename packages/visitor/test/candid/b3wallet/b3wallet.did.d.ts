import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type AccessLevel = { 'ReadOnly' : null } |
  { 'Limited' : Array<OperationAccess> } |
  { 'Canister' : null } |
  { 'FullAccess' : null };
export interface AddUser {
  'threshold' : [] | [number],
  'name' : string,
  'role' : Role,
  'signer_id' : Principal,
  'expires_at' : [] | [bigint],
}
export interface AppAccountsNonce {
  'staging' : bigint,
  'production' : bigint,
  'development' : bigint,
}
export interface AppStatus {
  'name' : string,
  'canister_id' : Principal,
  'status_at' : bigint,
  'version' : string,
  'canister_status' : CanisterStatusResponse,
  'account_status' : AppAccountsNonce,
}
export type BitcoinNetwork = { 'Mainnet' : null } |
  { 'Regtest' : null } |
  { 'Testnet' : null };
export interface BtcPending { 'txid' : string, 'account' : string }
export interface BtcTransfer {
  'to' : string,
  'account_id' : string,
  'network' : BitcoinNetwork,
  'amount' : TokenAmount,
}
export interface CanisterSettings {
  'freezing_threshold' : [] | [bigint],
  'controllers' : [] | [Array<Principal>],
  'reserved_cycles_limit' : [] | [bigint],
  'memory_allocation' : [] | [bigint],
  'compute_allocation' : [] | [bigint],
}
export interface CanisterStatusResponse {
  'status' : CanisterStatusType,
  'memory_size' : bigint,
  'cycles' : bigint,
  'settings' : DefiniteCanisterSettings,
  'query_stats' : QueryStats,
  'idle_cycles_burned_per_day' : bigint,
  'module_hash' : [] | [Uint8Array | number[]],
  'reserved_cycles' : bigint,
}
export type CanisterStatusType = { 'stopped' : null } |
  { 'stopping' : null } |
  { 'running' : null };
export type ChainEnum = { 'BTC' : BitcoinNetwork } |
  { 'EVM' : bigint } |
  { 'ICP' : null } |
  { 'ICRC' : Principal } |
  { 'CKBTC' : BitcoinNetwork };
export interface CkbtcPending { 'block_index' : bigint, 'txid' : [] | [bigint] }
export interface ConsentMessage {
  'title' : string,
  'message' : string,
  'reason' : string,
}
export interface CreateAccount {
  'env' : [] | [Environment],
  'name' : [] | [string],
}
export interface DefiniteCanisterSettings {
  'freezing_threshold' : bigint,
  'controllers' : Array<Principal>,
  'reserved_cycles_limit' : bigint,
  'memory_allocation' : bigint,
  'compute_allocation' : bigint,
}
export type Environment = { 'Production' : null } |
  { 'Development' : null } |
  { 'Staging' : null };
export interface EvmContractDeployed {
  'transaction' : EvmTransaction1559,
  'contract_address' : string,
}
export interface EvmDeployContract {
  'account_id' : string,
  'hex_byte_code' : Uint8Array | number[],
  'max_priority_fee_per_gas' : [] | [bigint],
  'max_fee_per_gas' : [] | [bigint],
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : [] | [bigint],
}
export interface EvmPending { 'block_index' : bigint }
export interface EvmSignMessage {
  'account_id' : string,
  'chain_id' : bigint,
  'message' : Uint8Array | number[],
}
export interface EvmSignRawTransaction {
  'account_id' : string,
  'hex_raw_tx' : Uint8Array | number[],
  'chain_id' : bigint,
}
export interface EvmSignTranscation {
  'account_id' : string,
  'transaction' : EvmTransaction,
  'chain_id' : bigint,
}
export type EvmTransaction = { 'EvmTransaction1559' : EvmTransaction1559 } |
  { 'EvmTransaction2930' : EvmTransaction2930 } |
  { 'EvmTransactionLegacy' : EvmTransactionLegacy };
export interface EvmTransaction1559 {
  'r' : string,
  's' : string,
  'v' : string,
  'to' : string,
  'value' : bigint,
  'max_priority_fee_per_gas' : bigint,
  'data' : string,
  'max_fee_per_gas' : bigint,
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : bigint,
  'access_list' : Array<[string, Array<string>]>,
}
export interface EvmTransaction2930 {
  'r' : string,
  's' : string,
  'v' : string,
  'to' : string,
  'value' : bigint,
  'data' : string,
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : bigint,
  'access_list' : Array<[string, Array<string>]>,
  'gas_price' : bigint,
}
export interface EvmTransactionLegacy {
  'r' : string,
  's' : string,
  'v' : string,
  'to' : string,
  'value' : bigint,
  'data' : string,
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : bigint,
  'gas_price' : bigint,
}
export interface EvmTransfer {
  'to' : string,
  'account_id' : string,
  'value' : bigint,
  'max_priority_fee_per_gas' : [] | [bigint],
  'max_fee_per_gas' : [] | [bigint],
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : [] | [bigint],
}
export interface EvmTransferErc20 {
  'to' : string,
  'account_id' : string,
  'value' : bigint,
  'max_priority_fee_per_gas' : [] | [bigint],
  'max_fee_per_gas' : [] | [bigint],
  'chain_id' : bigint,
  'nonce' : bigint,
  'gas_limit' : [] | [bigint],
  'contract_address' : string,
}
export interface HideAccount { 'account_id' : string }
export interface ICPToken { 'e8s' : bigint }
export interface IcpPending { 'block_index' : bigint, 'canister_id' : string }
export interface IcpTransfer {
  'to' : string,
  'fee' : [] | [ICPToken],
  'account_id' : string,
  'memo' : [] | [bigint],
  'amount' : ICPToken,
}
export interface IcrcPending { 'tx_index' : bigint, 'block_index' : bigint }
export interface LogEntry {
  'counter' : bigint,
  'file' : string,
  'line' : number,
  'cycle' : [] | [bigint],
  'version' : string,
  'message' : string,
  'timestamp' : bigint,
  'variant' : LogVariant,
}
export type LogVariant = { 'info' : null } |
  { 'warn' : null } |
  { 'error' : null };
export interface NotifyTopUp {
  'account_id' : string,
  'block_index' : bigint,
  'canister_id' : Principal,
}
export type Operation = { 'UnhideAccount' : HideAccount } |
  { 'EvmDeployContract' : EvmDeployContract } |
  { 'IcpTransfer' : IcpTransfer } |
  { 'EvmSignRawTransaction' : EvmSignRawTransaction } |
  { 'EvmSignMessage' : EvmSignMessage } |
  { 'UpdateCanisterSettings' : UpdateCanisterSettings } |
  { 'RenameAccount' : RenameAccount } |
  { 'AddUser' : AddUser } |
  { 'EvmSignTranscation' : EvmSignTranscation } |
  { 'EvmTransferErc20' : EvmTransferErc20 } |
  { 'SendToken' : SendToken } |
  { 'HideAccount' : HideAccount } |
  { 'UpgradeCanister' : UpgradeCanister } |
  { 'TopUpTransfer' : TopUpTransfer } |
  { 'BtcTransfer' : BtcTransfer } |
  { 'RemoveUser' : RemoveUser } |
  { 'RemoveAccount' : HideAccount } |
  { 'CreateAccount' : CreateAccount } |
  { 'EvmTransfer' : EvmTransfer };
export interface OperationAccess {
  'valid_until' : [] | [bigint],
  'operation' : OperationEnum,
}
export type OperationEnum = { 'UnhideAccount' : null } |
  { 'EvmDeployContract' : null } |
  { 'IcpTransfer' : null } |
  { 'EvmSignRawTransaction' : null } |
  { 'EvmSignMessage' : null } |
  { 'UpdateCanisterSettings' : null } |
  { 'RenameAccount' : null } |
  { 'AddUser' : null } |
  { 'EvmSignTranscation' : null } |
  { 'EvmTransferErc20' : null } |
  { 'SendToken' : null } |
  { 'HideAccount' : null } |
  { 'UpgradeCanister' : null } |
  { 'TopUpTransfer' : null } |
  { 'BtcTransfer' : null } |
  { 'RemoveUser' : null } |
  { 'RemoveAccount' : null } |
  { 'CreateAccount' : null } |
  { 'EvmTransfer' : null };
export type OperationResult = { 'Empty' : null } |
  { 'AccountCreated' : CreateAccount } |
  { 'CanisterTopUped' : [NotifyTopUp, bigint] } |
  { 'BtcTransfered' : [BtcTransfer, string] } |
  { 'IcpTransfered' : [IcpTransfer, bigint] } |
  { 'TokenSent' : [SendToken, SendResult] } |
  { 'AccountRenamed' : RenameAccount } |
  { 'EvmContractDeployed' : EvmContractDeployed } |
  { 'EvmErc20Transfered' : [EvmTransferErc20, string] } |
  { 'SignerRemoved' : RemoveUser } |
  { 'EvmTransfered' : [EvmTransfer, string] } |
  { 'EvmRawTransactionSigned' : [EvmSignRawTransaction, string] } |
  { 'TopUpTransfered' : [TopUpTransfer, bigint] } |
  { 'AccountHidden' : HideAccount } |
  { 'EvmMessageSigned' : [EvmSignMessage, Uint8Array | number[]] } |
  { 'CanisterSettingsUpdated' : UpdateCanisterSettings } |
  { 'SignerAdded' : AddUser } |
  { 'CanisterUpgraded' : UpgradeCanister } |
  { 'EvmTransactionSigned' : [EvmSignTranscation, string] } |
  { 'AccountUnhidden' : HideAccount } |
  { 'AccountRemoved' : HideAccount };
export type OperationStatus = { 'Fail' : null } |
  { 'Success' : null } |
  { 'Expired' : null } |
  { 'Pending' : null };
export interface OutPoint { 'txid' : Uint8Array | number[], 'vout' : number }
export type PendingEnum = { 'BTC' : BtcPending } |
  { 'EVM' : EvmPending } |
  { 'ICP' : IcpPending } |
  { 'ICRC' : IcrcPending } |
  { 'CKBTC' : CkbtcPending };
export interface PendingOperation {
  'id' : bigint,
  'status' : OperationStatus,
  'responses' : Array<[Principal, Response]>,
  'allowed_signers' : Array<Principal>,
  'request' : Operation,
  'deadline' : bigint,
  'consent_message' : ConsentMessage,
  'created_at' : bigint,
  'created_by' : Principal,
  'version' : string,
}
export interface ProcessedOperation {
  'status' : OperationStatus,
  'result' : OperationResult,
  'method' : string,
  'error' : [] | [string],
  'operation' : PendingOperation,
  'timestamp' : bigint,
}
export interface QueryStats {
  'response_payload_bytes_total' : bigint,
  'num_instructions_total' : bigint,
  'num_calls_total' : bigint,
  'request_payload_bytes_total' : bigint,
}
export interface RemoveUser { 'signer_id' : Principal }
export interface RenameAccount { 'account_id' : string, 'new_name' : string }
export type Response = { 'Reject' : null } |
  { 'Confirm' : null };
export type Result = { 'Ok' : bigint } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : ProcessedOperation } |
  { 'Err' : string };
export type RetrieveBtcStatus = { 'Signing' : null } |
  { 'Confirmed' : { 'txid' : Uint8Array | number[] } } |
  { 'Sending' : { 'txid' : Uint8Array | number[] } } |
  { 'AmountTooLow' : null } |
  { 'Unknown' : null } |
  { 'Submitted' : { 'txid' : Uint8Array | number[] } } |
  { 'Pending' : null };
export interface Role { 'access_level' : AccessLevel, 'name' : string }
export type SendResult = { 'BTC' : string } |
  { 'EVM' : null } |
  { 'ICP' : bigint } |
  { 'ICRC' : bigint } |
  { 'CKBTC' : bigint };
export interface SendToken {
  'to' : string,
  'account_id' : string,
  'chain' : ChainEnum,
  'amount' : TokenAmount,
}
export interface TokenAmount { 'decimals' : number, 'amount' : bigint }
export interface TopUpTransfer {
  'fee' : [] | [ICPToken],
  'account_id' : string,
  'canister_id' : Principal,
  'amount' : ICPToken,
}
export interface UpdateCanisterSettings {
  'canister_id' : Principal,
  'settings' : CanisterSettings,
}
export interface UpgradeCanister {
  'wasm_hash_string' : string,
  'wasm_version' : string,
}
export interface User {
  'metadata' : Array<[string, Value]>,
  'name' : string,
  'role' : Role,
  'expires_at' : [] | [bigint],
}
export interface Utxo {
  'height' : number,
  'value' : bigint,
  'outpoint' : OutPoint,
}
export type UtxoStatus = { 'ValueTooSmall' : Utxo } |
  { 'Tainted' : Utxo } |
  {
    'Minted' : {
      'minted_amount' : bigint,
      'block_index' : bigint,
      'utxo' : Utxo,
    }
  } |
  { 'Checked' : Utxo };
export type Value = { 'Int' : bigint } |
  { 'Map' : Array<[string, Value]> } |
  { 'Nat' : bigint } |
  { 'Nat64' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string } |
  { 'Array' : Array<Value> };
export interface WalletAccountView {
  'id' : string,
  'metadata' : Array<[string, Value]>,
  'pendings' : Array<PendingEnum>,
  'name' : string,
  'hidden' : boolean,
  'addresses' : Array<[ChainEnum, string]>,
  'environment' : Environment,
}
export interface WalletSettings {
  'freezing_threshold' : [] | [bigint],
  'controllers' : Array<[Principal, string]>,
  'initialised' : boolean,
  'metadata' : Array<[string, Value]>,
  'reserved_cycles_limit' : [] | [bigint],
  'memory_allocation' : [] | [bigint],
  'compute_allocation' : [] | [bigint],
}
export interface WalletSettingsAndSigners {
  'signers' : Array<[Principal, User]>,
  'settings' : WalletSettings,
}
export interface WasmDetails { 'hash' : Uint8Array | number[], 'size' : bigint }
export interface _SERVICE {
  'account_add_pending' : ActorMethod<
    [string, ChainEnum, PendingEnum],
    undefined
  >,
  'account_balance' : ActorMethod<[string, ChainEnum], bigint>,
  'account_btc_fees' : ActorMethod<[BitcoinNetwork, number], bigint>,
  'account_check_pending' : ActorMethod<[string, ChainEnum, bigint], undefined>,
  'account_create' : ActorMethod<
    [[] | [Environment], [] | [string]],
    undefined
  >,
  'account_create_address' : ActorMethod<[string, ChainEnum], undefined>,
  'account_hide' : ActorMethod<[string], undefined>,
  'account_remove' : ActorMethod<[string], undefined>,
  'account_remove_address' : ActorMethod<[string, ChainEnum], undefined>,
  'account_remove_pending' : ActorMethod<
    [string, ChainEnum, bigint],
    undefined
  >,
  'account_rename' : ActorMethod<[string, string], undefined>,
  'account_restore' : ActorMethod<[Environment, bigint], undefined>,
  'account_send' : ActorMethod<
    [string, ChainEnum, string, TokenAmount],
    SendResult
  >,
  'account_swap_btc_to_ckbtc' : ActorMethod<
    [string, BitcoinNetwork, bigint],
    BtcPending
  >,
  'account_swap_ckbtc_to_btc' : ActorMethod<
    [string, BitcoinNetwork, string, bigint],
    bigint
  >,
  'account_top_up_and_notify' : ActorMethod<
    [string, ICPToken, [] | [Principal]],
    Result
  >,
  'account_update_balance' : ActorMethod<
    [string, BitcoinNetwork],
    Array<UtxoStatus>
  >,
  'add_controller_and_update' : ActorMethod<[Principal, string], undefined>,
  'add_setting_metadata' : ActorMethod<[string, Value], undefined>,
  'canister_cycle_balance' : ActorMethod<[], bigint>,
  'canister_version' : ActorMethod<[], bigint>,
  'get_account' : ActorMethod<[string], WalletAccountView>,
  'get_account_count' : ActorMethod<[], bigint>,
  'get_account_counters' : ActorMethod<[], AppAccountsNonce>,
  'get_account_view' : ActorMethod<[string], WalletAccountView>,
  'get_account_views' : ActorMethod<[], Array<WalletAccountView>>,
  'get_addresses' : ActorMethod<[string], Array<[ChainEnum, string]>>,
  'get_pending_list' : ActorMethod<[], Array<PendingOperation>>,
  'get_processed_list' : ActorMethod<[], Array<ProcessedOperation>>,
  'get_roles' : ActorMethod<[], Array<[bigint, Role]>>,
  'get_signers' : ActorMethod<[], Array<[Principal, User]>>,
  'init_wallet' : ActorMethod<
    [Array<[Principal, string]>, [] | [Array<[string, Value]>]],
    undefined
  >,
  'is_connected' : ActorMethod<[], boolean>,
  'load_wasm' : ActorMethod<[Uint8Array | number[]], bigint>,
  'name' : ActorMethod<[], string>,
  'print_log_entries' : ActorMethod<[], Array<LogEntry>>,
  'refresh_settings' : ActorMethod<[], undefined>,
  'remove_setting_metadata' : ActorMethod<[string], undefined>,
  'report_bug' : ActorMethod<[Principal, string], undefined>,
  'request_account_rename' : ActorMethod<
    [RenameAccount, string, [] | [bigint]],
    bigint
  >,
  'request_add_signer' : ActorMethod<[AddUser, string, [] | [bigint]], bigint>,
  'request_connect' : ActorMethod<[string], bigint>,
  'request_create_account' : ActorMethod<
    [CreateAccount, string, [] | [bigint]],
    bigint
  >,
  'request_delete_account' : ActorMethod<
    [HideAccount, string, [] | [bigint]],
    bigint
  >,
  'request_maker' : ActorMethod<[Operation, string, [] | [bigint]], bigint>,
  'request_remove_signer' : ActorMethod<
    [RemoveUser, string, [] | [bigint]],
    bigint
  >,
  'request_send' : ActorMethod<[SendToken, string, [] | [bigint]], bigint>,
  'request_transfer_btc' : ActorMethod<
    [BtcTransfer, string, [] | [bigint]],
    bigint
  >,
  'request_transfer_icp' : ActorMethod<
    [IcpTransfer, string, [] | [bigint]],
    bigint
  >,
  'request_update_settings' : ActorMethod<
    [UpdateCanisterSettings, string, [] | [bigint]],
    bigint
  >,
  'request_upgrade_canister' : ActorMethod<[string], bigint>,
  'reset_accounts' : ActorMethod<[], undefined>,
  'response' : ActorMethod<[bigint, Response], Result_1>,
  'retrieve_btc_status' : ActorMethod<
    [BitcoinNetwork, bigint],
    RetrieveBtcStatus
  >,
  'role_add' : ActorMethod<[Role], Array<[bigint, Role]>>,
  'role_remove' : ActorMethod<[bigint], Array<[bigint, Role]>>,
  'setting_and_signer' : ActorMethod<[], WalletSettingsAndSigners>,
  'signer_add' : ActorMethod<[Principal, Role], Array<[Principal, User]>>,
  'signer_remove' : ActorMethod<[Principal], Array<[Principal, User]>>,
  'status' : ActorMethod<[], AppStatus>,
  'uninstall_wallet' : ActorMethod<[], undefined>,
  'unload_wasm' : ActorMethod<[], bigint>,
  'update_controller' : ActorMethod<
    [Array<[Principal, string]>],
    Array<[Principal, string]>
  >,
  'update_settings' : ActorMethod<[], undefined>,
  'upgrage_wallet' : ActorMethod<[], undefined>,
  'validate_user' : ActorMethod<[Principal], boolean>,
  'version' : ActorMethod<[], string>,
  'wasm_details' : ActorMethod<[], WasmDetails>,
  'wasm_hash' : ActorMethod<[], Uint8Array | number[]>,
  'wasm_hash_string' : ActorMethod<[], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
