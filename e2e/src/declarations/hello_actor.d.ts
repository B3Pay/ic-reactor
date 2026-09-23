import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Profile {
  status: Status
  balance: bigint
  owner: Principal
  tags: Array<string>
  nonce: bigint
  delta: bigint
  avatar: [] | [Uint8Array | number[]]
}
export type Status = { Active: null } | { Frozen: string }
export interface _SERVICE {
  boom: ActorMethod<[], undefined>
  count: ActorMethod<[], bigint>
  divide: ActorMethod<[bigint, bigint], { Ok: bigint } | { Err: string }>
  greet: ActorMethod<[string], string>
  greet_update: ActorMethod<[string], string>
  increment: ActorMethod<[], bigint>
  profile: ActorMethod<[Principal], Profile>
  whoami: ActorMethod<[], Principal>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
