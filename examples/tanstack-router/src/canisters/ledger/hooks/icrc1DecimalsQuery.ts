/**
 * Query: icrc1_decimals
 *
 * Hand-maintained, because this example writes its reactor by hand. In a
 * project whose reactor codegen generates, `factories: true` generates this
 * same object under this same name (see examples/codegen-in-action).
 *
 * @example
 * // Use in components
 * const { data, isLoading } = icrc1DecimalsQuery.useQuery()
 *
 * // Prefetch in loaders
 * const data = await icrc1DecimalsQuery.fetch()
 *
 * // Invalidate cache
 * icrc1DecimalsQuery.invalidate()
 *
 * // Get query key for cache manipulation
 * const key = icrc1DecimalsQuery.getQueryKey()
 */

import { createQuery } from "@ic-reactor/react"
import { ledgerReactor } from "../reactor"

/**
 * Query for icrc1_decimals
 *
 * Provides:
 * - .useQuery() - React hook
 * - .fetch() - Direct fetch (for loaders)
 * - .invalidate() - Invalidate cache
 * - .getQueryKey() - Get query key
 * - .getCacheData() - Read from cache
 */
export const icrc1DecimalsQuery = createQuery(ledgerReactor, {
  functionName: "icrc1_decimals",
  // Customize your query options:
  // staleTime: 5 * 60 * 1000,
  // select: (data) => data,
})
