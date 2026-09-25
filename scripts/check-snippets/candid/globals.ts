// Names the candid README's snippets share: the adapter and the reactor its
// first examples build, and what a method's arguments hold.
import { CandidAdapter, CandidReactor } from "@ic-reactor/candid"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { clientManager } from "../app/reactor"

export * from "../app/globals"

export const adapter = new CandidAdapter({ clientManager })

export const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  name: "my-canister",
})

/** The account owner an ICRC-1 call is made for. */
export declare const owner: Principal

/** A service type, such as `idlFactory({ IDL })` returns. */
export declare const service: IDL.ServiceClass
