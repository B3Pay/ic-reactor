/**
 * Shared internal utilities for query and mutation factories.
 */

import type { QueryKey } from "@tanstack/react-query"
import { generateKey } from "@ic-reactor/core"

/**
 * Internal query-key segment used to distinguish per-call factory args
 * from the base query key. Not part of the public API.
 */
export const FACTORY_KEY_ARGS_QUERY_KEY = "__ic_reactor_factory_key_args"

/**
 * Merge a base query key, optional per-call query key, and optional key-args
 * into a single query key array.
 *
 * Used by createInfiniteQueryFactory and createSuspenseInfiniteQueryFactory to
 * ensure each unique set of factory args produces a distinct cache entry.
 */
export function mergeFactoryQueryKey(
  baseQueryKey?: QueryKey,
  callQueryKey?: QueryKey,
  keyArgs?: unknown
): QueryKey | undefined {
  const merged: unknown[] = []

  if (baseQueryKey) merged.push(...baseQueryKey)
  if (callQueryKey) merged.push(...callQueryKey)
  if (keyArgs !== undefined) {
    // Serialize keyArgs through generateKey so BigInt values (and other
    // non-JSON-serializable Candid types such as Principal) are safely
    // converted to strings before React Query hashes the key.
    const safeKeyArgs = generateKey(
      Array.isArray(keyArgs) ? keyArgs : [keyArgs]
    )
    merged.push({ [FACTORY_KEY_ARGS_QUERY_KEY]: safeKeyArgs })
  }

  return merged.length > 0 ? merged : undefined
}

/**
 * Build a chained select function that first applies the config-level select
 * (if any) and then the hook-level select (if any).
 *
 * This enables `createQuery` / `createSuspenseQuery` to support two-level
 * select chaining without duplicating the logic.
 */
export function buildChainedSelect<TData, TSelected, TFinal = TSelected>(
  configSelect: ((data: TData) => TSelected) | undefined,
  hookSelect: ((data: TSelected) => TFinal) | undefined
): (rawData: TData) => TSelected | TFinal {
  return (rawData: TData) => {
    const firstPass = configSelect
      ? configSelect(rawData)
      : (rawData as unknown as TSelected)
    return hookSelect ? hookSelect(firstPass) : firstPass
  }
}
