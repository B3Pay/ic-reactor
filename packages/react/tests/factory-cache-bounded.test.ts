import { describe, it, expect } from "vitest"
import { createBoundedCache } from "../src/utils.js"

/**
 * The args-late factories memoize one query object per argument set so
 * `getBalance(sameArgs)` returns the same object twice. The memo was an
 * unbounded Map, so an open-ended argument space — a per-principal balance in a
 * long-lived SPA, a search-as-you-type filter, a cursor-keyed list — grew it
 * forever (~2.9 kB per entry, 55.8 MB at 20k).
 */
describe("createBoundedCache", () => {
  it("memoizes, which is the point of the cache", () => {
    const cache = createBoundedCache<{ id: number }>(4)
    const value = { id: 1 }
    cache.set("a", value)

    expect(cache.get("a")).toBe(value)
  })

  it("never grows past its limit", () => {
    const cache = createBoundedCache<number>(4)
    for (let i = 0; i < 1000; i++) cache.set(`k${i}`, i)

    expect(cache.size).toBe(4)
  })

  it("evicts the least recently used entry", () => {
    const cache = createBoundedCache<number>(3)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)

    // Touch "a" so "b" becomes the oldest.
    expect(cache.get("a")).toBe(1)
    cache.set("d", 4)

    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")).toBe(1)
    expect(cache.get("c")).toBe(3)
    expect(cache.get("d")).toBe(4)
  })

  it("keeps a realistic working set fully memoized", () => {
    // The pattern the memo exists for: a bounded set of args, hit repeatedly.
    const cache = createBoundedCache<{ id: number }>(256)
    const objects = new Map<string, { id: number }>()
    for (let i = 0; i < 50; i++) {
      const value = { id: i }
      objects.set(`arg${i}`, value)
      cache.set(`arg${i}`, value)
    }

    for (const [key, value] of objects) {
      expect(cache.get(key)).toBe(value)
    }
  })

  it("re-setting an existing key updates rather than duplicating", () => {
    const cache = createBoundedCache<number>(2)
    cache.set("a", 1)
    cache.set("a", 2)

    expect(cache.size).toBe(1)
    expect(cache.get("a")).toBe(2)
  })
})
