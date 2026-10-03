// Scenario 1: server prefetch with `{ id }` targets, handed to the browser.
//
// Rules:
// - Keys come only from the client: every read is
//   `client.queryOptions(ledger, method)`, never a key written by hand.
// - A server has no `ic_env` cookie, so every canister is an `{ id }` target.
// - `dehydrate(client.queryClient)` is JSON-safe as it is: the client's
//   `QueryClient` dehydrates `bigint`, `Uint8Array` and the floats JSON cannot
//   write into tagged JSON, and hydrates them back exactly (scenario 3).
//
// The page renders the result's `state` in a `<HydrationBoundary>`, so the
// cards' `useQuery` calls find their data in the cache on the server render
// and on the browser's first render. A failed read is not dehydrated (TanStack
// dehydrates successful queries only); its ledger is in `failures`, and the
// page renders that ledger's error on the server (scenario 8).
import type { Client } from "@ic-reactor/core"
import { dehydrate, type DehydratedState } from "@tanstack/react-query"
import { actor, type Actor } from "@/canisters/icrc1"
import type { LedgerRef } from "@/ledgers"
import { summarizeError, type ErrorSummary } from "./error-summary"

/** The reads of a ledger's card. None takes an argument. */
export const TOKEN_READS = [
  "icrc1_name",
  "icrc1_symbol",
  "icrc1_decimals",
  "icrc1_fee",
  "icrc1_total_supply",
  "icrc1_minting_account",
  "icrc1_metadata",
] as const

export interface PrefetchedLedgers {
  /** The client's cache, dehydrated: plain JSON, for a `<HydrationBoundary>`. */
  readonly state: DehydratedState
  /** The ledgers whose reads failed, by canister id, with the first failure. */
  readonly failures: Readonly<Record<string, ErrorSummary>>
}

/**
 * Reads every token read of every ledger into `client`'s cache, then
 * dehydrates it. `client` is the request's own (src/server/request-client.ts);
 * nothing here holds a client of its own.
 */
export async function prefetchLedgers(
  client: Client,
  ledgers: readonly LedgerRef[]
): Promise<PrefetchedLedgers> {
  const reads = ledgers.flatMap(({ id }) => {
    const ledger = client.canister<Actor>(actor, { id })
    return TOKEN_READS.map((method) => ({
      id,
      options: client.queryOptions(ledger, method),
    }))
  })
  // `prefetchQuery` never throws: a failed read stays in the cache with its
  // error, read back below. A server never retries a read.
  await Promise.all(
    reads.map(({ options }) => client.queryClient.prefetchQuery(options))
  )

  const failures: Record<string, ErrorSummary> = {}
  for (const { id, options } of reads) {
    const error = client.queryClient.getQueryState(options.queryKey)?.error
    if (error != null && failures[id] === undefined) {
      failures[id] = summarizeError(error)
    }
  }
  return { state: dehydrate(client.queryClient), failures }
}
