/**
 * A client's cache survives a server-to-browser hand-off: `dehydrate()` on
 * one client, `JSON.stringify`, `JSON.parse`, `hydrate()` into another, and
 * every Candid value comes back exactly, `bigint` and `Uint8Array` included.
 */
import { describe, expect, it } from "vitest"
import { dehydrate, hydrate } from "@tanstack/query-core"
import { createClient } from "../src/client.js"
import { deserializeData, serializeData } from "../src/hydration.js"

/** What a canister reply can decode to, as candid-core 0.3 shapes it. */
const CANDID_VALUES = {
  "nat above 2^64": 340282366920938463463374607431768211457n,
  "negative int": -18446744073709551617n,
  "zero nat": 0n,
  blob: new Uint8Array([0, 1, 127, 128, 254, 255]),
  "empty blob": new Uint8Array(),
  "principal text": "rdmx6-jaaaa-aaaaa-aaadq-cai",
  "absent opt": null,
  "boxed opt holding null": { some: null },
  "nested boxed opts": { some: { some: 1n } },
  variant: {
    tag: "Ok",
    value: { amount: 5n, memo: new Uint8Array([9]), to: "2vxsx-fae" },
  },
  "nested variant": {
    tag: "Err",
    value: { tag: "InsufficientFunds", value: { balance: 3n } },
  },
  "vec of nat": [1n, 2n, 18446744073709551615n],
  floats: [1.5, -2.25, NaN, Infinity, -Infinity, -0, 0],
  "record shaped like a tag": { $ic: "bigint", v: "1" },
  "record shaped like an escaped record": { $ic: "object", v: { a: 1 } },
  "record with a tag-shaped field": { $ic: { $ic: "undefined" }, ok: true },
  text: 'quotes " and \\ and   and emoji \u{1f600}',
  "bool and empty": [true, false, [], {}],
} as const

/** Moves `value` through a server client's cache to a browser client's, as JSON. */
function handOff(value: unknown): unknown {
  const server = createClient({ network: "ic", identity: "anonymous" })
  const browser = createClient({ network: "ic", identity: "anonymous" })
  server.queryClient.setQueryData(["value"], value)

  const json = JSON.stringify(dehydrate(server.queryClient))
  hydrate(browser.queryClient, JSON.parse(json))

  return browser.queryClient.getQueryData(["value"])
}

describe("a client's dehydrated cache", () => {
  it.each(Object.entries(CANDID_VALUES))(
    "round-trips %s through JSON into another client",
    (_name, value) => {
      expect(handOff(value)).toStrictEqual(value)
    }
  )

  it("round-trips every value of one reply together", () => {
    expect(handOff(CANDID_VALUES)).toStrictEqual(CANDID_VALUES)
  })

  it("brings integers back as bigint, blobs as Uint8Array and -0 as -0", () => {
    const back = handOff({
      big: 2n ** 70n,
      bytes: new Uint8Array([1, 2]),
      zero: -0,
    }) as { big: unknown; bytes: unknown; zero: number }

    expect(typeof back.big).toBe("bigint")
    expect(back.big).toBe(2n ** 70n)
    expect(back.bytes).toBeInstanceOf(Uint8Array)
    expect((back.bytes as Uint8Array).constructor).toBe(Uint8Array)
    expect(Object.is(back.zero, -0)).toBe(true)
  })

  it("writes JSON with no bigint left in it", () => {
    const server = createClient({ network: "ic", identity: "anonymous" })
    server.queryClient.setQueryData(["balance"], 10n ** 30n)

    expect(() => JSON.stringify(dehydrate(server.queryClient))).not.toThrow()
  })
})

describe("the serializer", () => {
  const roundTrip = (value: unknown): unknown =>
    deserializeData(JSON.parse(JSON.stringify(serializeData(value))))

  it("keeps undefined where JSON would drop it or write null", () => {
    const back = roundTrip({ present: undefined, list: [1, undefined, 2] }) as {
      present?: undefined
      list: unknown[]
    }

    expect("present" in back).toBe(true)
    expect(back.list).toStrictEqual([1, undefined, 2])
  })

  it("keeps a __proto__ field as a field, without touching the prototype", () => {
    // A Candid record may name a field "__proto__"; JSON.parse makes it an
    // own key, and so must the way back.
    const value = {}
    Object.defineProperty(value, "__proto__", {
      value: { polluted: 1n },
      enumerable: true,
      writable: true,
      configurable: true,
    })
    const back = roundTrip(value) as Record<string, unknown>

    expect(Object.getPrototypeOf(back)).toBe(Object.prototype)
    expect(Object.keys(back)).toEqual(["__proto__"])
    expect(Object.getOwnPropertyDescriptor(back, "__proto__")?.value).toEqual({
      polluted: 1n,
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("encodes a blob larger than one chunk", () => {
    const blob = new Uint8Array(100_000).map((_, i) => (i * 7) % 256)

    expect(roundTrip(blob)).toStrictEqual(blob)
  })

  it("brings a Node Buffer back as a plain Uint8Array", () => {
    const back = roundTrip(Buffer.from([1, 2, 3]))

    expect(back).toStrictEqual(new Uint8Array([1, 2, 3]))
  })

  it("treats what is not a Candid value as JSON does", () => {
    const date = new Date("2026-10-02T00:00:00.000Z")
    const back = roundTrip({
      date,
      skipped: () => 1,
      list: [() => 1, Symbol("s")],
    })

    expect(back).toStrictEqual({
      date: "2026-10-02T00:00:00.000Z",
      list: [null, null],
    })
  })

  it("refuses a cyclic structure, as JSON.stringify does", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => serializeData(cyclic)).toThrow(/cyclic/)
    // A value seen twice, but not inside itself, is no cycle.
    const shared = { n: 1n }
    expect(roundTrip([shared, shared])).toStrictEqual([shared, shared])
  })

  it("refuses a tag it does not know instead of guessing", () => {
    expect(() => deserializeData({ $ic: "date", v: "x" })).toThrow(
      /unknown tag "date"/
    )
    expect(() => deserializeData({ $ic: "bigint", v: 1 })).toThrow(
      /malformed bigint tag/
    )
    expect(() => deserializeData({ $ic: "number", v: "toString" })).toThrow(
      /malformed number tag/
    )
  })
})
