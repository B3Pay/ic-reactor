import type { Principal } from "@dfinity/principal"
import type { ActorMethod } from "@dfinity/agent"

export interface AnonymousUserData {
  texts: BigUint64Array | bigint[]
  created_at: bigint
  decryption_key: [] | [Uint8Array | number[]]
}
export interface AuthenticatedSignature {
  signature: Uint8Array | number[]
  created_at: bigint
}
export interface LogEntry {
  counter: bigint
  file: string
  line: number
  cycle: [] | [bigint]
  version: string
  message: string
  timestamp: bigint
  variant: LogVariant
}
export type LogVariant = { info: null } | { warn: null } | { error: null }
export interface OneTimeKey {
  tries: number
  time_lock: bigint
  public_key: Uint8Array | number[]
}
export interface PartitionDetail {
  id: number
  name: string
  size: bigint
}
export type Result =
  | { Ok: [Uint8Array | number[], Uint8Array | number[]] }
  | { Err: string }
export type Task =
  | { CleanUpKeys: null }
  | { SendText: { body: string; phone_number: string } }
  | { CleanUpAnonymousUsers: null }
  | { SendEmail: { subject: string; body: string; email: string } }
  | { Initialize: null }
export interface TaskTimerEntry {
  task: Task
  time: bigint
}
export interface UserData {
  texts: BigUint64Array | bigint[]
  signature: [] | [AuthenticatedSignature]
  public_key: Uint8Array | number[]
}
export interface UserText {
  id: string
  text: Uint8Array | number[]
}
export interface _SERVICE {
  add_simple_note: ActorMethod<[Uint8Array | number[], string], bigint>
  anonymous_user: ActorMethod<[Uint8Array | number[]], AnonymousUserData>
  anonymous_user_notes: ActorMethod<[Uint8Array | number[]], Array<UserText>>
  anonymous_users: ActorMethod<
    [],
    Array<[Uint8Array | number[], AnonymousUserData]>
  >
  edit_encrypted_text: ActorMethod<
    [bigint, Uint8Array | number[], [] | [Uint8Array | number[]]],
    undefined
  >
  encrypted_ibe_decryption_key_for_caller: ActorMethod<
    [Uint8Array | number[]],
    Uint8Array | number[]
  >
  encrypted_symmetric_key_for_caller: ActorMethod<
    [Uint8Array | number[]],
    Uint8Array | number[]
  >
  encrypted_texts: ActorMethod<[], Array<UserText>>
  get_one_time_key: ActorMethod<[bigint], Uint8Array | number[]>
  get_one_time_key_details: ActorMethod<[bigint], OneTimeKey>
  ibe_encryption_key: ActorMethod<[], Uint8Array | number[]>
  partition_details: ActorMethod<[], Array<PartitionDetail>>
  print_log_entries: ActorMethod<[], Array<LogEntry>>
  print_log_entries_page: ActorMethod<[bigint, [] | [bigint]], Array<string>>
  read_with_one_time_key: ActorMethod<
    [bigint, Uint8Array | number[], Uint8Array | number[]],
    Result
  >
  request_two_factor_authentication: ActorMethod<
    [Uint8Array | number[]],
    string
  >
  save_encrypted_text: ActorMethod<
    [Uint8Array | number[], [] | [Uint8Array | number[]]],
    bigint
  >
  set_one_time_key: ActorMethod<[bigint, Uint8Array | number[]], undefined>
  symmetric_key_verification_key: ActorMethod<[], Uint8Array | number[]>
  timers: ActorMethod<[], Array<TaskTimerEntry>>
  two_factor_verification_key: ActorMethod<[], string>
  user_data: ActorMethod<[], UserData>
  user_notes: ActorMethod<
    [[] | [Uint8Array | number[]]],
    [bigint, Array<UserText>]
  >
  user_simple_notes: ActorMethod<[Uint8Array | number[]], Array<string>>
  version: ActorMethod<[], string>
}
