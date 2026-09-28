// `src/reactor/index.ts` of the createActorHooks overview: the `Reactor`s the
// page's `hooks.ts` builds hooks for. `backend` is the page's setup and
// `ledger` is the reactor its "Multiple Canisters" section adds next to it, on
// another canister.
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import {
  canisterId as ledgerCanisterId,
  idlFactory as ledgerIdlFactory,
  type _SERVICE as LedgerService,
} from "../../../app/declarations/ledger"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({ queryClient })

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId,
  name: "backend",
})

export const ledger = new Reactor<LedgerService>({
  clientManager,
  idlFactory: ledgerIdlFactory,
  canisterId: ledgerCanisterId,
  name: "ledger",
})
