// Tool names for listed canisters' methods.
import { describe, expect, it } from "vitest"
import { MAX_TOOL_NAME, toolNames } from "../src/server/naming.ts"

describe("toolNames", () => {
  it("is <canister>_<method> for plain, short names", () => {
    expect(
      toolNames(
        [
          { canister: "ledger", method: "icrc1_balance_of" },
          { canister: "ledger", method: "icrc1_transfer" },
        ],
        []
      )
    ).toEqual(["ledger_icrc1_balance_of", "ledger_icrc1_transfer"])
  })

  it("hashes a name with other characters, a long one and a taken one", () => {
    const names = toolNames(
      [
        { canister: "c", method: "get balance" },
        { canister: "c", method: "get_balance" },
        { canister: "c", method: "a".repeat(60) },
        { canister: "list", method: "methods" },
        { canister: "c", method: "ünïcödé" },
      ],
      ["list_methods"]
    )
    expect(names[1]).toBe("c_get_balance")
    expect(names[0]).toMatch(/^c_get_balance_[0-9a-f]{8}$/)
    expect(names[2]).toMatch(/^c_a+_[0-9a-f]{8}$/)
    expect(names[3]).toMatch(/^list_methods_[0-9a-f]{8}$/)
    expect(names[4]).toMatch(/^c__n_c_d__[0-9a-f]{8}$/)
    for (const name of names) {
      expect(name).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(name.length).toBeLessThanOrEqual(MAX_TOOL_NAME)
    }
    expect(new Set(names).size).toBe(names.length)
  })

  it("gives the same names for the same input", () => {
    const pairs = [
      { canister: "c", method: "x y" },
      { canister: "d", method: "z".repeat(80) },
    ]
    expect(toolNames(pairs, [])).toEqual(toolNames(pairs, []))
  })

  it("keeps names unique when a method is named like another's hash", () => {
    const [first] = toolNames([{ canister: "c", method: "x y" }], [])
    const names = toolNames(
      [
        { canister: "c", method: first.slice(2) },
        { canister: "c", method: "x y" },
      ],
      []
    )
    expect(names[0]).toBe(first)
    expect(names[1]).not.toBe(first)
    expect(names[1]).toMatch(/^c_x_y_[0-9a-f]{8}$/)
  })
})
