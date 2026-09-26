/**
 * Query: icrc1_decimals
 *
 * Hand-maintained, not codegen output. Codegen's `factories: true` generates
 * the createQuery, createQueryFactory and createMutation kinds for every
 * method (see examples/codegen-in-action), but no suspense factories like
 * this one.
 *
 * @example
 * // Use in components
 * const { data } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
 *
 * // Prefetch in loaders
 * const data = await icrc1DecimalsSuspenseQuery.fetch()
 *
 * // Invalidate cache
 * icrc1DecimalsSuspenseQuery.invalidate()
 *
 * // Get query key for cache manipulation
 * const key = icrc1DecimalsSuspenseQuery.getQueryKey()
 */

import { createSuspenseQuery } from "@ic-reactor/react"
import { ledgerReactor } from "../reactor"

/**
 * Query for icrc1_decimals
 *
 * Provides:
 * - .useSuspenseQuery() - React hook
 * - .fetch() - Direct fetch (for loaders)
 * - .invalidate() - Invalidate cache
 * - .getQueryKey() - Get query key
 * - .getCacheData() - Read from cache
 */
export const icrc1DecimalsSuspenseQuery = createSuspenseQuery(ledgerReactor, {
  functionName: "icrc1_decimals",
  // Customize your query options:
  // staleTime: 5 * 60 * 1000,
  // select: (data) => data,
})
