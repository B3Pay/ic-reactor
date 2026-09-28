// The canister the reference pages call, `./declarations/backend`: everything
// the default app's canister declares (`get_profile`, `greet`, ...), plus the
// camelCase methods, Motoko style, that the pages of `Reactor`,
// `DisplayReactor`, the hooks and the validation helpers use.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { _SERVICE as AppService } from "../../../app/declarations/backend"

export * from "../../../app/declarations/backend"

export interface User {
  id: string
  name: string
  email: string
  bio: [] | [string]
  avatar: [] | [Uint8Array]
}
export type CreateUserError =
  { EmailAlreadyExists: null } | { InvalidName: null }

/** A record of every type the display transform changes. */
export interface Account {
  balance: bigint
  owner: Principal
  createdAt: bigint
  metadata: Array<[string, bigint]>
  status: { Active: null } | { Frozen: null }
  avatar: Uint8Array
  description: [] | [string]
}

export interface Transaction {
  id: bigint
  hash: Uint8Array
  signature: Uint8Array
}
export interface DocumentInput {
  hash: Uint8Array
  data: Uint8Array
}

export interface TransferInput {
  to: Principal
  amount: bigint
}
export type TransferError =
  { InsufficientFunds: { balance: bigint } } | { InvalidRecipient: null }

export interface _SERVICE extends AppService {
  getUser: ActorMethod<[string], User>
  getAccount: ActorMethod<[Principal], Account>
  getBalance: ActorMethod<[Principal], bigint>
  createUser: ActorMethod<
    [{ name: string; email: string }],
    { Ok: User } | { Err: CreateUserError }
  >
  updateProfile: ActorMethod<[{ name: string }], { Ok: User } | { Err: string }>
  createPost: ActorMethod<
    [{ title: string; content: string }],
    { Ok: string } | { Err: string }
  >
  transfer: ActorMethod<
    [TransferInput],
    { Ok: bigint } | { Err: TransferError }
  >
  getTransaction: ActorMethod<[bigint], Transaction>
  saveDocument: ActorMethod<[DocumentInput], undefined>
  whoami: ActorMethod<[], Principal>
}
