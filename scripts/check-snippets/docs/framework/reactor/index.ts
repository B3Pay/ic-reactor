// `src/reactor/index.ts` of the framework pages: the setup React Setup builds,
// with the second canister of its Multiple Actors section. `backend` is a raw
// `Reactor` (Candid values); `ledger` is another one on the same
// `ClientManager`.
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import {
  canisterId as ledgerCanisterId,
  idlFactory as ledgerIdlFactory,
  type _SERVICE as Ledger,
} from "../../../app/declarations/ledger"
import { canisterId, idlFactory, type _SERVICE } from "../declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({ queryClient })

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})

export const ledger = new Reactor<Ledger>({
  clientManager,
  idlFactory: ledgerIdlFactory,
  name: "ledger",
  canisterId: ledgerCanisterId,
})
