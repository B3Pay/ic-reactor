// `@/canisters/ledger/reactor` of the tanstack-router demo: its
// `src/canisters/ledger/reactor.ts`, as the page shows it. The `@/` alias
// reaches `src/`.
import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../../lib/client"
import { idlFactory, type _SERVICE } from "../../declarations/icrc1.did"

export type LedgerService = _SERVICE

export const ledgerReactor = new DisplayReactor<LedgerService>({
  clientManager,
  idlFactory,
  name: "ledger",
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorSuspenseInfiniteQuery,
  useActorMethod,
} = createActorHooks(ledgerReactor)
