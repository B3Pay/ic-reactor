// The canister the guides call, `./declarations/backend`: everything the
// default app's canister declares (`greet`, `register_begin`, ...), plus the
// methods the guides make up to show one thing each: a user with a `Result`
// (`get_user`) or an `opt` (`getUser`) result, a ledger-like balance and
// transfer, and the `register_finish` an OpenID sign-up ends with.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { _SERVICE as AppService } from "../../../app/declarations/backend"

export * from "../../../app/declarations/backend"

export interface User {
  id: string
  name: string
  email: string
  createdAt: bigint
}
export interface CreateUserInput {
  name: string
  email: string
}
export type CreateUserError =
  { EmailAlreadyExists: null } | { InvalidEmail: null }
export type GetUserError =
  { NotFound: null } | { Unauthorized: { reason: string } }

export interface Config {
  theme: string
  language: string
}

export type TransferError =
  | { InsufficientFunds: { balance: bigint; required: bigint } }
  | { InvalidRecipient: null }
  | { AmountTooSmall: { minimum: bigint } }
  | { Unauthorized: null }

export interface _SERVICE extends AppService {
  getUser: ActorMethod<[string], [] | [User]>
  get_user: ActorMethod<[string], { Ok: User } | { Err: GetUserError }>
  createUser: ActorMethod<
    [CreateUserInput],
    { Ok: User } | { Err: CreateUserError }
  >
  listUsers: ActorMethod<[bigint, bigint], Array<User>>
  getBalance: ActorMethod<[Principal], bigint>
  balance: ActorMethod<[], bigint>
  deposit: ActorMethod<
    [bigint],
    { Ok: bigint } | { Err: { InvalidAmount: null } }
  >
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: TransferError }
  >
  getPrice: ActorMethod<[], bigint>
  getData: ActorMethod<[], string>
  getConfig: ActorMethod<[], Config>
  create: ActorMethod<[string], { Ok: string } | { Err: string }>
  register_finish: ActorMethod<
    [{ data: Uint8Array; signature: Uint8Array }],
    undefined
  >
}
