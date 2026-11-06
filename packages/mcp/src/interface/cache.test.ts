import { describe, expect, it } from "vitest"
import { Lru } from "./cache.ts"

describe("Lru", () => {
  it("evicts the least recently used entry past its count", () => {
    const lru = new Lru<string, number>({ maxEntries: 2 })
    lru.set("a", 1)
    lru.set("b", 2)
    // A read makes "a" the most recent, so "b" goes first.
    expect(lru.get("a")).toBe(1)
    lru.set("c", 3)
    expect([lru.has("a"), lru.has("b"), lru.has("c")]).toEqual([
      true,
      false,
      true,
    ])
  })

  it("does not refresh an entry it only peeks at", () => {
    const lru = new Lru<string, number>({ maxEntries: 2 })
    lru.set("a", 1)
    lru.set("b", 2)
    expect(lru.peek("a")).toBe(1)
    lru.set("c", 3)
    expect(lru.has("a")).toBe(false)
  })

  it("evicts past its weight, and counts a replaced value once", () => {
    const lru = new Lru<string, string>({
      maxEntries: 10,
      maxWeight: 10,
      weigh: (value) => value.length,
    })
    lru.set("a", "xxxx")
    lru.set("a", "xxxxx")
    lru.set("b", "yyyyy")
    expect(lru.size).toBe(2)
    lru.set("c", "z")
    expect([lru.has("a"), lru.has("b"), lru.has("c")]).toEqual([
      false,
      true,
      true,
    ])
    // A value heavier than the bound is not kept at all.
    lru.set("d", "w".repeat(11))
    expect(lru.size).toBe(0)
  })
})
