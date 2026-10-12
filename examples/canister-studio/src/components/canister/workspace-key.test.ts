import { describe, expect, it } from "vitest"
import { pickMountsWorkspace } from "./workspace-key.ts"

describe("pickMountsWorkspace", () => {
  it("is false for the method already open, which nothing remounts to take the flag", () => {
    expect(
      pickMountsWorkspace(
        { method: "get_neuron_info", certified: true },
        { method: "get_neuron_info", certified: true }
      )
    ).toBe(false)
  })

  it("is true for another method, the overview's quick reads, or the open method from a link", () => {
    expect(pickMountsWorkspace({ method: "a" }, { method: "b" })).toBe(true)
    expect(
      pickMountsWorkspace({}, { method: "icrc1_fee", args: "4449444c0000" })
    ).toBe(true)
    // A shared link's arguments are dropped by the list's link: a new runner.
    expect(
      pickMountsWorkspace(
        { method: "a", args: "4449444c0000" },
        { method: "a" }
      )
    ).toBe(true)
  })
})
