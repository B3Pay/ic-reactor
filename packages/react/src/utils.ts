/**
 * Shared internal utilities for query and mutation factories.
 */

import type { QueryKey } from "@tanstack/react-query"
import type { ReactorQueryData } from "@ic-reactor/core"
import { generateKey } from "@ic-reactor/core"

/**
 * Internal query-key segment used to distinguish per-call factory args
 * from the base query key. Not part of the public API.
 */
export const FACTORY_KEY_ARGS_QUERY_KEY = "__ic_reactor_factory_key_args"

/** Convert a direct reactor result into a value TanStack Query can cache. */
export const normalizeQueryData = <T>(value: T): ReactorQueryData<T> =>
  (value === undefined ? null : value) as ReactorQueryData<T>

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
 * Build a chained select that applies the config-level select (if any) and then
 * the hook-level select (if any).
 *
 * Returns the caller's own function untouched when only one of the two is
 * present, and `undefined` when neither is — allocating a wrapper only for the
 * genuinely chained case. Identity matters here: `QueryObserver` memoizes a
 * select result on `options.select === previousSelectFn`, so a wrapper rebuilt
 * on every render defeats that check. The select then re-runs each render, and
 * for a select returning a non-plain value (a `Map`, a `Date`, a `Principal`)
 * `replaceEqualDeep` cannot structurally share the result either, so `data`
 * gets a fresh reference every render and a `useEffect([data])` that sets state
 * becomes an unbounded loop.
 *
 * Callers should still memoize the result, since the chained case allocates.
 */
export function buildChainedSelect<TData, TSelected, TFinal = TSelected>(
  configSelect: ((data: TData) => TSelected) | undefined,
  hookSelect: ((data: TSelected) => TFinal) | undefined
): ((rawData: TData) => TSelected | TFinal) | undefined {
  if (!configSelect) {
    // `hookSelect` receives the raw data when there is no config-level select,
    // matching the previous behaviour.
    return hookSelect as unknown as
      ((rawData: TData) => TSelected | TFinal) | undefined
  }
  if (!hookSelect) return configSelect
  return (rawData: TData) => hookSelect(configSelect(rawData))
}

/**
 * How many memoized query objects an args-late factory keeps.
 *
 * The memo exists so `getBalance(sameArgs)` returns the same object twice; it
 * was unbounded, so an open-ended argument space — a per-principal balance in a
 * long-lived SPA, a search-as-you-type filter, a cursor-keyed list — grew it
 * forever (measured at ~2.9 kB per entry, 55.8 MB for 20k). A few hundred
 * covers any realistic working set while capping the worst case.
 */
const FACTORY_CACHE_LIMIT = 256

/**
 * Smallest useful LRU: a `Map` already iterates in insertion order, so
 * re-inserting on read is enough to track recency.
 *
 * Eviction is safe — it costs memoization, never correctness. A query object is
 * a closure over the reactor and config, so one rebuilt after eviction behaves
 * identically; only its reference identity differs.
 */
export function createBoundedCache<V>(limit: number = FACTORY_CACHE_LIMIT) {
  const entries = new Map<string, V>()

  return {
    get(key: string): V | undefined {
      const value = entries.get(key)
      if (value === undefined) return undefined
      // Touch: move to the most-recent end.
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key: string, value: V): void {
      if (entries.has(key)) entries.delete(key)
      else if (entries.size >= limit) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, value)
    },
    get size(): number {
      return entries.size
    },
  }
}
