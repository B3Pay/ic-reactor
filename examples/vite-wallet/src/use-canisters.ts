// Scenario 1: the two canisters, by name and by id.
//
// `client.canister()` returns the same object for the same service and
// target, so components call this in render.
import type { Canister } from "@ic-reactor/core"
import { useClient } from "@ic-reactor/react"
import {
  actor as backendActor,
  type Actor as Backend,
} from "./canisters/backend.ts"
import {
  actor as ledgerActor,
  type Actor as Ledger,
} from "./canisters/ledger.ts"

/** The ICP ledger: the NNS installs it at its mainnet id on a local network too. */
export const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

export interface WalletCanisters {
  readonly backend: Canister<Backend>
  /**
   * The same backend, with its query replies certified: the address book is
   * read through it, because a contact decides where a payment goes.
   */
  readonly certifiedBackend: Canister<Backend>
  readonly ledger: Canister<Ledger>
}

export function useCanisters(): WalletCanisters {
  const client = useClient()
  return {
    // `icp deploy` picks the backend's id, and a fresh network picks another
    // one: the ic_env cookie carries it as PUBLIC_CANISTER_ID:backend, read
    // each time a call or a key is built.
    backend: client.canister<Backend>(backendActor, { name: "backend" }),
    // A plain query is answered and signed by one replica. A read that
    // decides where value goes, or what a person approves, is certified
    // instead: it is sent as a replicated call, and the subnet's certificate
    // is checked. That costs what an update costs (as long, and the canister
    // pays cycles), so only those reads use it.
    certifiedBackend: client.canister<Backend>(backendActor, {
      name: "backend",
      certified: true,
    }),
    // An id that never changes is written down: it needs no cookie, and
    // works where there is none (a server, a script).
    ledger: client.canister<Ledger>(ledgerActor, { id: ICP_LEDGER }),
  }
}
