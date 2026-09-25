// `src/ledger.ts` of the guides: a raw `Reactor` of an ICRC-1 ledger that
// shares the backend's `ClientManager` and sign-in.
import { defineReactor } from "@ic-reactor/react"
import {
  canisterId as ledgerId,
  idlFactory as ledgerIdl,
  type _SERVICE as Ledger,
} from "./declarations/ledger"
import { backendApp } from "./reactor"

export const ledgerApp = defineReactor<Ledger>({
  name: "ledger",
  idlFactory: ledgerIdl,
  canisterId: ledgerId,
  authentication: backendApp.authentication,
})
export const ledger = ledgerApp.reactor
