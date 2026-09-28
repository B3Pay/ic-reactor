// `./ledger` of the reference pages: the reactor of an ICRC-1 ledger and the
// query and mutation objects an app builds on it, as `factories: true`
// generates them (`ledgerReactor`, `icrc1NameQuery`, ...) or by hand
// (`decimalsQuery`, `balanceQuery`, `transferMutation`). It is a
// DisplayReactor, so a `nat` is text and an account owner is text.
import {
  createMutation,
  createQuery,
  createSuspenseQuery,
  createSuspenseQueryFactory,
  defineDisplayReactor,
} from "@ic-reactor/react"
import {
  canisterId,
  idlFactory,
  type _SERVICE,
} from "../../app/declarations/ledger"

export const { reactor: ledgerReactor } = defineDisplayReactor<_SERVICE>({
  name: "ledger",
  idlFactory,
  canisterId,
})
export const ledger = ledgerReactor

export const icrc1NameQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_name",
})
export const icrc1SymbolQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_symbol",
})

export const decimalsQuery = createSuspenseQuery(ledgerReactor, {
  functionName: "icrc1_decimals",
})
export const balanceQuery = createSuspenseQueryFactory(ledgerReactor, {
  functionName: "icrc1_balance_of",
})
export const transferMutation = createMutation(ledgerReactor, {
  functionName: "icrc1_transfer",
})
