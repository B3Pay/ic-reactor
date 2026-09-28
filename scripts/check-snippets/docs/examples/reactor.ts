// `./reactor` of the pages that show `src/reactor.ts` in pieces: the default
// app's, plus the ckBTC wallet's ledger and minter reactors, the hooks and the
// query and mutation objects its snippets read, and the tanstack-router demo's
// shared ledger reactor (`../reactor` of its query modules).
import {
  DisplayReactor,
  createActorHooks,
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import { clientManager } from "../../app/reactor"
import {
  idlFactory as ckbtcIdlFactory,
  type _SERVICE as CkbtcLedger,
} from "./declarations/ckbtc"
import {
  idlFactory as minterIdlFactory,
  type _SERVICE as CkbtcMinter,
} from "./declarations/minter"
import {
  idlFactory as ledgerIdlFactory,
  type _SERVICE as LedgerService,
} from "./declarations/icrc1.did"

export * from "../../app/reactor"

export const ckbtcLedger = new DisplayReactor<CkbtcLedger>({
  clientManager,
  name: "ckbtcLedger",
  canisterId: "mc6ru-gyaaa-aaaar-qaaaq-cai",
  idlFactory: ckbtcIdlFactory,
})

export const ckbtcMinter = new DisplayReactor<CkbtcMinter>({
  clientManager,
  name: "ckbtcMinter",
  canisterId: "ml52i-qqaaa-aaaar-qaaba-cai",
  idlFactory: minterIdlFactory,
})

export const { useActorQuery: useCkbtcLedgerQuery } =
  createActorHooks(ckbtcLedger)

export const balanceQuery = createQueryFactory(ckbtcLedger, {
  functionName: "icrc1_balance_of",
})

export const updateBalanceMutation = createMutation(ckbtcMinter, {
  functionName: "update_balance",
})

export const ledgerReactor = new DisplayReactor<LedgerService>({
  clientManager,
  idlFactory: ledgerIdlFactory,
  name: "ledger",
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})

export const icrc1NameQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_name",
})

/**
 * The hooks the tanstack-router demo's `src/canisters/ledger/reactor.ts`
 * destructures. Under this name so the default app's `useActorQuery` (over the
 * backend) stays what `./reactor` exports.
 */
export const ledgerHooks = createActorHooks(ledgerReactor)
