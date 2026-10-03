// The balances of one account across the ledgers, read on the server for the
// /account page: as plain queries for the section the page waits for
// (scenario 6), and as certified reads for the section that streams in
// (scenario 5).
//
// Rules:
// - Reads go through the request client's cache, with
//   `client.queryClient.fetchQuery(client.queryOptions(...))`.
//   `icrc1_decimals` and `icrc1_symbol` do not change mid-render, so they come
//   from `ensureQueryData`: a Server Component of the same request that found
//   them already read would not ask again. A certified canister is another
//   object with keys of its own (they end in "certified"), so the certified
//   section reads its own: an uncertified answer is never served where a
//   certified one was asked for.
// - Each ledger fails alone: its row carries the `ReactorError` kind, and the
//   other rows still render.
import type { Principal } from "@candid-core/schema"
import type { Client } from "@ic-reactor/core"
import { actor, type Actor } from "@/canisters/icrc1"
import type { LedgerRef } from "@/ledgers"
import { summarizeError, type ErrorSummary } from "./error-summary"

/** One ledger's answer for an account, or why there is none. */
export type BalanceRow =
  | {
      readonly ledger: LedgerRef
      readonly ok: true
      /** Base units: format them with `decimals`, never as a `number`. */
      readonly balance: bigint
      readonly decimals: number
      readonly symbol: string
    }
  | {
      readonly ledger: LedgerRef
      readonly ok: false
      readonly error: ErrorSummary
    }

/**
 * The default account (no subaccount) of `owner` on each ledger.
 *
 * @param options.certified - Read through consensus, so every reply is
 * certified: slower (a replicated call takes a second or two), and cached
 * under keys of its own.
 */
export async function readBalances(
  client: Client,
  owner: Principal,
  ledgers: readonly LedgerRef[],
  options: { readonly certified?: boolean } = {}
): Promise<BalanceRow[]> {
  const certified = options.certified ?? false
  return Promise.all(
    ledgers.map(async (ref): Promise<BalanceRow> => {
      const ledger = client.canister<Actor>(actor, { id: ref.id, certified })
      try {
        const [balance, decimals, symbol] = await Promise.all([
          client.queryClient.fetchQuery(
            client.queryOptions(ledger, "icrc1_balance_of", {
              owner,
              subaccount: null,
            })
          ),
          // Taken from this request's cache when it holds them already.
          client.queryClient.ensureQueryData(
            client.queryOptions(ledger, "icrc1_decimals")
          ),
          client.queryClient.ensureQueryData(
            client.queryOptions(ledger, "icrc1_symbol")
          ),
        ])
        return { ledger: ref, ok: true, balance, decimals, symbol }
      } catch (error) {
        return { ledger: ref, ok: false, error: summarizeError(error) }
      }
    })
  )
}
