// Scenario 6: the owner search parameter is user input, validated on the
// server. Principal text becomes a principal; anything else is a message.
import { describe, expect, it } from "vitest"
import { SAMPLE_OWNER } from "@/ledgers"
import { parseOwner } from "./parse-owner"

describe("parseOwner", () => {
  it("makes a principal of principal text, without the spaces around it", () => {
    expect(parseOwner(`  ${SAMPLE_OWNER} `)).toEqual({
      kind: "valid",
      text: SAMPLE_OWNER,
      owner: SAMPLE_OWNER,
    })
  })

  it("refuses text that is not a principal, with a message that names it", () => {
    for (const text of [
      "not-a-principal",
      SAMPLE_OWNER.toUpperCase(),
      SAMPLE_OWNER.slice(0, -1),
    ]) {
      const input = parseOwner(text)
      expect(input.kind).toBe("invalid")
      expect(input.kind === "invalid" && input.reason).toContain(`"${text}"`)
    }
  })

  it("reads no parameter, or a blank one, as nothing asked", () => {
    expect(parseOwner(undefined)).toEqual({ kind: "empty" })
    expect(parseOwner("   ")).toEqual({ kind: "empty" })
  })

  it("uses the first of a repeated parameter", () => {
    expect(parseOwner([SAMPLE_OWNER, "aaaaa-aa"])).toMatchObject({
      kind: "valid",
      owner: SAMPLE_OWNER,
    })
  })
})
