import { describe, expect, it } from "vitest"
import {
  createVariant,
  getVariantKey,
  getVariantKeyValue,
  getVariantValue,
  getVariantValueByKey,
  isKeyMatchVariant,
} from "../src/index.js"
import type { CandidVariantKey } from "../src/index.js"

describe("candid variant helpers", () => {
  it("supports raw single-key variants", () => {
    const variant = { Ok: "done" } as const

    expect(getVariantKey(variant)).toBe("Ok")
    expect(getVariantKeyValue(variant)).toEqual(["Ok", "done"])
    expect(getVariantValue(variant)).toBe("done")
    expect(getVariantValueByKey(variant, "Ok")).toBe("done")
    expect(isKeyMatchVariant(variant, "Ok")).toBe(true)
  })

  it("supports display variants with a payload key", () => {
    const variant = {
      _type: "Err",
      Err: {
        code: "E_ACCESS",
        message: "No access",
      },
    } as const

    expect(getVariantKey(variant)).toBe("Err")
    expect(getVariantKeyValue(variant)).toEqual([
      "Err",
      {
        code: "E_ACCESS",
        message: "No access",
      },
    ])
    expect(getVariantValue(variant)).toEqual({
      code: "E_ACCESS",
      message: "No access",
    })
    expect(getVariantValueByKey(variant, "Err")).toEqual({
      code: "E_ACCESS",
      message: "No access",
    })
    expect(isKeyMatchVariant(variant, "Err")).toBe(true)
  })

  it("supports display variants without a payload key for null variants", () => {
    const variant = { _type: "Pending" } as const

    expect(getVariantKey(variant)).toBe("Pending")
    expect(getVariantKeyValue(variant)).toEqual(["Pending", null])
    expect(getVariantValue(variant)).toBeNull()
    expect(getVariantValueByKey(variant, "Pending")).toBeNull()
    expect(isKeyMatchVariant(variant, "Pending")).toBe(true)
  })

  it("supports variants created by createVariant", () => {
    const variant = createVariant({ Active: null })

    expect(getVariantKey(variant)).toBe("Active")
    expect(getVariantKeyValue(variant)).toEqual(["Active", null])
    expect(getVariantValue(variant)).toBeNull()
    expect(getVariantValueByKey(variant, "Active")).toBeNull()
  })

  it("rejects display variants whose discriminator and payload key disagree", () => {
    const variant = {
      _type: "Ok",
      Err: "boom",
    } as const

    expect(() => getVariantKey(variant)).toThrow(
      "discriminator _type=Ok does not match payload key Err"
    )
  })

  // Type-level regression guards. These assert at compile time, which no runtime
  // assertion can do -- `pnpm typecheck` covers this file, so a regression here
  // fails CI rather than silently widening the public key type.
  it("keeps CandidVariantKey narrow", () => {
    type Collapsed<K> = string extends K ? true : false

    // A null-payload arm is named by its discriminant...
    const nullPayload: CandidVariantKey<{ _type: "Pending" }> = "Pending"
    // ...and a payload arm by its key, from either direction.
    const withPayload: CandidVariantKey<{ _type: "Ok"; Ok: string }> = "Ok"
    // Raw (non-display) variants are unaffected.
    const raw: CandidVariantKey<{ Ok: string } | { Err: string }> = "Err"

    // A non-literal `_type` must NOT drag the whole union up to `string`;
    // that would make every key/value helper stop checking its argument.
    const notCollapsed: Collapsed<CandidVariantKey<{ _type: string }>> = false
    const literalNotCollapsed: Collapsed<
      CandidVariantKey<{ _type: "Pending" }>
    > = false

    expect([
      nullPayload,
      withPayload,
      raw,
      notCollapsed,
      literalNotCollapsed,
    ]).toBeDefined()
  })
})
