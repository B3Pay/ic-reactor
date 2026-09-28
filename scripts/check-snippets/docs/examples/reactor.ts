// `./reactor` of the pages that show `src/reactor.ts` in pieces: the default
// app's, plus the ckBTC wallet's ledger and minter reactors, the hooks and the
// query and mutation objects its snippets read.
import {
  DisplayReactor,
  createActorHooks,
  createMutation,
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

// The tanstack-router demo's query modules import the shared ledger reactor as
// `../reactor`, which is `canisters/ledger/reactor.ts` there.
export { ledgerReactor } from "./canisters/ledger/reactor"
