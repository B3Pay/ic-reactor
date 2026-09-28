// `@/canisters/ledger/hooks` of the tanstack-router demo: the barrel of its
// `src/canisters/ledger/hooks/` modules, one query object per ICRC-1 method.
// The `@/` alias reaches `src/`.
import { createQuery } from "@ic-reactor/react"
import { ledgerReactor } from "./reactor"

export const icrc1NameQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_name",
})

export const icrc1SymbolQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_symbol",
})
