// `./declarations/backend` of the React README.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"

export interface Profile {
  id: string
  name: string
}
export interface Post {
  id: bigint
  title: string
  likes: bigint
}
export type TransferError =
  { InsufficientFunds: { balance: bigint } } | { InvalidRecipient: null }

export interface _SERVICE {
  greet: ActorMethod<[string], string>
  increment: ActorMethod<[], bigint>
  balance: ActorMethod<[], bigint>
  get_profile: ActorMethod<[string], Profile>
  get_my_profile: ActorMethod<[], Profile>
  list_profiles: ActorMethod<[], Array<Profile>>
  update_profile: ActorMethod<
    [Profile],
    { Ok: Profile } | { Err: { NotFound: null } }
  >
  get_post: ActorMethod<[bigint], Post>
  like_post: ActorMethod<[bigint], undefined>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: TransferError }
  >
  register_begin: ActorMethod<[], Uint8Array>
  register_finish: ActorMethod<
    [{ data: Uint8Array; signature: Uint8Array }],
    undefined
  >
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
