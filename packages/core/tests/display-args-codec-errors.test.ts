import { describe, it, expect, vi } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import {
  didToDisplayCodec,
  transformArgsWithCodec,
} from "../src/display/index.js"

/**
 * A codec failure is the most precise diagnostic available — it names the field
 * and the expected shape. It used to be swallowed and the untransformed display
 * args passed on to `IDL.encode`, which produced a generic Candid error far
 * from the real cause, or silently encoded something the caller did not intend.
 */
describe("transformArgsWithCodec — argument conversion failures", () => {
  const accountCodec = didToDisplayCodec(
    IDL.Record({ owner: IDL.Principal, amount: IDL.Nat })
  )

  it("throws instead of returning the untransformed args", () => {
    expect(() =>
      transformArgsWithCodec(accountCodec, [{ owner: 42, amount: "1" }])
    ).toThrow(/could not convert the argument/i)
  })

  it("preserves the codec's own error as `cause`", () => {
    let caught: unknown
    try {
      transformArgsWithCodec(accountCodec, [{ owner: 42, amount: "1" }])
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error & { cause?: unknown }).cause).toBeDefined()
  })

  it("does not log to console.error any more", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      transformArgsWithCodec(accountCodec, [{ owner: 42, amount: "1" }])
    } catch {
      // expected
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it("still passes valid args through untouched", () => {
    const codec = didToDisplayCodec(IDL.Record({ amount: IDL.Nat }))
    expect(transformArgsWithCodec(codec, [{ amount: "10" }])).toEqual([
      { amount: 10n },
    ])
  })

  it("leaves empty args alone", () => {
    expect(transformArgsWithCodec(accountCodec, [])).toEqual([])
    expect(transformArgsWithCodec(accountCodec, undefined)).toEqual([])
  })
})
