// Names the core README's snippets share: its `ClientManager` and the
// `Reactor` it builds over `my_canister`, and the other canisters' declarations
// its multi-canister examples use.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"
import {
  canisterId,
  idlFactory,
  type _SERVICE,
} from "../app/declarations/my_canister"

export * from "../app/globals"
export {
  canisterId,
  idlFactory,
  type _SERVICE,
  type _SERVICE as Backend,
  idlFactory as backendIdl,
} from "../app/declarations/my_canister"
export {
  type _SERVICE as Ledger,
  idlFactory as ledgerIdl,
} from "../app/declarations/ledger"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({ queryClient })

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})
export const reactor = backend

/** An ICRC-7 collection, `./declarations/nft`. */
export interface NFT {
  icrc7_name: ActorMethod<[], string>
  icrc7_owner_of: ActorMethod<[Array<bigint>], Array<[] | [Principal]>>
}
export declare const nftIdl: IDL.InterfaceFactory

export const managementCanisterId = Principal.managementCanister()

/** The arguments of `my_method`, and of a `transfer`. */
export declare const arg1: string
export declare const arg2: bigint
export declare const transferArgs: { to: Principal; amount: bigint }

/** A form's text input value, and the setter of its error message. */
export declare const input: string
export declare function setError(message: string): void
