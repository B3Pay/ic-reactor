import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface AppBug {
  logs: Array<string>
  name: string
  canister_id: Principal
  description: string
  version: string
}
export interface AppView {
  updated_at: bigint
  metadata: Array<[string, Value]>
  name: string
  description: string
  created_at: bigint
  created_by: string
  releases: Array<ReleaseView>
  app_id: string
  install_count: bigint
}
export interface CanisterChange {
  timestamp_nanos: bigint
  canister_version: bigint
  origin: CanisterChangeOrigin
  details: CanisterChangeDetails
}
export type CanisterChangeDetails =
  | { creation: CreationRecord }
  | { code_deployment: CodeDeploymentRecord }
  | { controllers_change: CreationRecord }
  | { code_uninstall: null }
export type CanisterChangeOrigin =
  | { from_user: FromUserRecord }
  | { from_canister: FromCanisterRecord }
export interface CanisterInfoResponse {
  controllers: Array<Principal>
  module_hash: [] | [Uint8Array | number[]]
  recent_changes: Array<CanisterChange>
  total_num_changes: bigint
}
export type CanisterInstallMode =
  | { reinstall: null }
  | { upgrade: null }
  | { install: null }
export interface CanisterStatusResponse {
  status: CanisterStatusType
  memory_size: bigint
  cycles: bigint
  settings: DefiniteCanisterSettings
  query_stats: QueryStats
  idle_cycles_burned_per_day: bigint
  module_hash: [] | [Uint8Array | number[]]
}
export type CanisterStatusType =
  | { stopped: null }
  | { stopping: null }
  | { running: null }
export interface CodeDeploymentRecord {
  mode: CanisterInstallMode
  module_hash: Uint8Array | number[]
}
export interface CreateAppArgs {
  metadata: Array<[string, Value]>
  name: string
  description: string
}
export interface CreateReleaseArgs {
  features: string
  size: bigint
  version: string
  app_id: string
  wasm_hash: Uint8Array | number[]
}
export interface CreateUserArgs {
  metadata: Array<[string, Value]>
  canister_id: [] | [Principal]
}
export interface CreationRecord {
  controllers: Array<Principal>
}
export interface DefiniteCanisterSettings {
  freezing_threshold: bigint
  controllers: Array<Principal>
  memory_allocation: bigint
  compute_allocation: bigint
}
export interface FromCanisterRecord {
  canister_version: [] | [bigint]
  canister_id: Principal
}
export interface FromUserRecord {
  user_id: Principal
}
export interface LoadRelease {
  total: bigint
  chunks: bigint
}
export interface QueryStats {
  response_payload_bytes_total: bigint
  num_instructions_total: bigint
  num_calls_total: bigint
  request_payload_bytes_total: bigint
}
export interface ReleaseView {
  features: string
  date: bigint
  name: string
  size: bigint
  version: string
  deprecated: boolean
  wasm_hash: string
}
export type Result = { Ok: UserView } | { Err: string }
export type Result_1 = { Ok: AppView } | { Err: string }
export type Result_2 = { Ok: Principal } | { Err: string }
export type Result_3 = { Ok: ReleaseView } | { Err: string }
export interface SystemCanisterStatus {
  user_status: bigint
  status_at: bigint
  version: string
  canister_status: CanisterStatusResponse
}
export interface UserCanisterStatus {
  version: string
  canister_status: CanisterStatusResponse
}
export type UserStatus =
  | { Unregistered: null }
  | { Applications: Array<Principal> }
  | { Registered: null }
export interface UserView {
  updated_at: bigint
  metadata: Array<[string, Value]>
  created_at: bigint
  canisters: Array<Principal>
}
export type Value =
  | { Int: bigint }
  | { Map: Array<[string, Value]> }
  | { Nat: bigint }
  | { Nat64: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Array: Array<Value> }
export interface _SERVICE {
  add_release: ActorMethod<[CreateReleaseArgs], ReleaseView>
  add_user_app: ActorMethod<[Principal, string], Result>
  clear_bugs: ActorMethod<[Principal], undefined>
  create_app: ActorMethod<[CreateAppArgs], Result_1>
  create_app_canister: ActorMethod<[string], Result_2>
  create_user: ActorMethod<[CreateUserArgs], UserView>
  deprecate_release: ActorMethod<[string, Uint8Array | number[]], undefined>
  get_app: ActorMethod<[string], Result_1>
  get_app_version: ActorMethod<[Principal], string>
  get_apps: ActorMethod<[], Array<AppView>>
  get_bugs: ActorMethod<[Principal], Array<AppBug>>
  get_canister_info: ActorMethod<[Principal], CanisterInfoResponse>
  get_canisters: ActorMethod<[], Array<Principal>>
  get_create_canister_app_cycle: ActorMethod<[], [bigint, bigint]>
  get_latest_release: ActorMethod<[string], Result_3>
  get_release: ActorMethod<[Uint8Array | number[]], ReleaseView>
  get_release_by_hash_string: ActorMethod<[string], ReleaseView>
  get_states: ActorMethod<[], UserView>
  get_user_app_status: ActorMethod<[Principal], UserCanisterStatus>
  get_user_ids: ActorMethod<[], Array<Principal>>
  get_user_states: ActorMethod<[], Array<UserView>>
  get_user_status: ActorMethod<[], UserStatus>
  install_app: ActorMethod<[Principal, string], Result>
  load_wasm_chunk: ActorMethod<
    [Uint8Array | number[], Uint8Array | number[]],
    LoadRelease
  >
  releases: ActorMethod<[string], Array<ReleaseView>>
  remove_app: ActorMethod<[string], undefined>
  remove_release: ActorMethod<[Uint8Array | number[]], undefined>
  remove_user: ActorMethod<[Principal], undefined>
  remove_user_app: ActorMethod<[Principal], undefined>
  report_bug: ActorMethod<[AppBug], undefined>
  status: ActorMethod<[], SystemCanisterStatus>
  uninstall_app: ActorMethod<[Principal], Result>
  update_app: ActorMethod<[CreateAppArgs], Result_1>
  version: ActorMethod<[], string>
}
export declare const idlFactory: IDL.InterfaceFactory
