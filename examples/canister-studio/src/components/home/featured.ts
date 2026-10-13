import type { Client } from "@ic-reactor/core"
import type { QueryClient } from "@tanstack/react-query"
import {
  actor as minterActor,
  type Actor as MinterActor,
} from "../../canisters/ckbtc_minter.ts"
import {
  actor as icrc1Actor,
  type Actor as Icrc1Actor,
} from "../../canisters/icrc1.ts"

// The home page's reads, built the same way by the route's loader (to start
// them on the server) and by the cards (to read them), so both use one key.
//
// Every ledger goes through the icrc1 module, the ICP ledger included: it is
// an ICRC-1 ledger, and keys depend on the canister id and the argument
// bytes only, so the canister page's own icp_ledger module reads the same
// cache entries.

export function ledgerReads(client: Client, id: string) {
  const ledger = client.canister<Icrc1Actor>(icrc1Actor, { id })
  return {
    symbol: client.queryOptions(ledger, "icrc1_symbol"),
    decimals: client.queryOptions(ledger, "icrc1_decimals"),
    totalSupply: client.queryOptions(ledger, "icrc1_total_supply"),
    fee: client.queryOptions(ledger, "icrc1_fee"),
  }
}

export function minterReads(client: Client, id: string) {
  const minter = client.canister<MinterActor>(minterActor, { id })
  return { info: client.queryOptions(minter, "get_minter_info") }
}

// Starts a read without waiting for it, and never fails. On the server, a
// read still in flight when the page renders streams in as it lands (its card
// suspends). One that fails, or that the router cancels at its deadline
// (SERVER_READ_DEADLINE_MS), is never sent: the browser renders that card,
// reads again, and shows the real error only if its own read fails.
const start = (pending: Promise<unknown>): void => {
  pending.catch(() => undefined)
}

/** Starts the reads of a featured ledger's card (loader side). */
export function startLedgerReads(
  client: Client,
  queryClient: QueryClient,
  id: string
): void {
  const reads = ledgerReads(client, id)
  start(queryClient.query(reads.symbol))
  start(queryClient.query(reads.decimals))
  start(queryClient.query(reads.totalSupply))
  start(queryClient.query(reads.fee))
}

/** Starts the read of the featured minter's card (loader side). */
export function startMinterReads(
  client: Client,
  queryClient: QueryClient,
  id: string
): void {
  start(queryClient.query(minterReads(client, id).info))
}
