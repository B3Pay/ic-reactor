import { describe, expect, it } from "vitest"
import { toDisplayJson } from "./json.ts"

describe("toDisplayJson", () => {
  it("writes bigints as decimal strings and blobs as hex", () => {
    expect(
      JSON.parse(
        toDisplayJson({
          amount: 2n ** 64n,
          memo: Uint8Array.from([0, 0xab, 0xff]),
          list: [1n, -2n],
        })
      )
    ).toEqual({
      amount: "18446744073709551616",
      memo: "00abff",
      list: ["1", "-2"],
    })
  })

  it("reads blobs made in another realm (jsdom's TextEncoder)", () => {
    expect(toDisplayJson(new TextEncoder().encode("hi"))).toBe('"6869"')
  })

  it("keeps variants, opts and principals as they are", () => {
    expect(
      JSON.parse(
        toDisplayJson({
          result: { tag: "Ok", value: 5n },
          none: null,
          owner: "2vxsx-fae",
        })
      )
    ).toEqual({
      result: { tag: "Ok", value: "5" },
      none: null,
      owner: "2vxsx-fae",
    })
  })

  it("writes NaN and the infinities as strings, undefined as null", () => {
    expect(toDisplayJson([Number.NaN, Number.POSITIVE_INFINITY])).toBe(
      '[\n  "NaN",\n  "Infinity"\n]'
    )
    expect(toDisplayJson(undefined)).toBe("null")
  })

  it("keeps an own field named __proto__", () => {
    const value = {}
    Object.defineProperty(value, "__proto__", {
      value: 1n,
      enumerable: true,
      writable: true,
      configurable: true,
    })
    expect(toDisplayJson(value)).toBe('{\n  "__proto__": "1"\n}')
  })

  it("never throws, even on a cycle", () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(toDisplayJson(cycle)).toBe(
      '"[a value that cannot be shown as JSON]"'
    )
  })
})
