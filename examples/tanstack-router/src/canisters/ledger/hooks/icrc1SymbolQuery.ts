/**
 * Query: icrc1_symbol
 *
 * Hand-maintained, not codegen output. Codegen's `factories: true` generates
 * the createQuery, createQueryFactory and createMutation kinds for every
 * method (see examples/codegen-in-action), but not the suspense ones used here.
 *
 * @example
 * // Use in components
 * const { data, isLoading } = icrc1SymbolQuery.useQuery()
 *
 * // Prefetch in loaders
 * const data = await icrc1SymbolQuery.fetch()
 *
 * // Invalidate cache
 * icrc1SymbolQuery.invalidate()
 *
 * // Get query key for cache manipulation
 * const key = icrc1SymbolQuery.getQueryKey()
 */

import { createQuery } from "@ic-reactor/react"
import { ledgerReactor } from "../reactor"

/**
 * Query for icrc1_symbol
 *
 * Provides:
 * - .useQuery() - React hook
 * - .fetch() - Direct fetch (for loaders)
 * - .invalidate() - Invalidate cache
 * - .getQueryKey() - Get query key
 * - .getCacheData() - Read from cache
 */
export const icrc1SymbolQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_symbol",
  // Customize your query options:
  // staleTime: 5 * 60 * 1000,
  // select: (data) => data,
})
