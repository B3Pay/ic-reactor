/**
 * Query Factory: icrc1_balance_of
 *
 * Hand-maintained, not codegen output. Codegen's `factories: true` generates
 * the createQuery, createQueryFactory and createMutation kinds for every
 * method (see examples/codegen-in-action), but no suspense factories like
 * this one.
 *
 * @example
 * // Use in components
 * const { data } = icrc1BalanceOfSuspenseQuery([{ owner }]).useSuspenseQuery()
 *
 * // Prefetch in loaders
 * const data = await icrc1BalanceOfSuspenseQuery([{ owner }]).fetch()
 *
 * // Invalidate one account's balance, or every balance this factory made
 * icrc1BalanceOfSuspenseQuery([{ owner }]).invalidate()
 * icrc1BalanceOfSuspenseQuery.invalidate()
 *
 * // Get query key for cache manipulation
 * const key = icrc1BalanceOfSuspenseQuery([{ owner }]).getQueryKey()
 */

import { createSuspenseQueryFactory } from "@ic-reactor/react"
import { ledgerReactor } from "../reactor"

/**
 * Query factory for icrc1_balance_of
 *
 * Creates a query instance with the provided arguments.
 * Each unique set of args gets its own cached query.
 */
export const icrc1BalanceOfSuspenseQuery = createSuspenseQueryFactory(
  ledgerReactor,
  {
    functionName: "icrc1_balance_of",
    // Customize your query options:
    // staleTime: 5 * 60 * 1000,
    // select: (data) => data,
  }
)
