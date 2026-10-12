import { describe, expect, it, vi } from "vitest"

const init = vi.fn()
const didToModule = vi.fn(async () => ({
  ok: true as const,
  module: "// module",
  omitted: [],
}))
vi.mock("@candid-core/cli", () => ({ init, didToModule }))

describe("the browser compiler", () => {
  it("tries again after an init that failed, instead of failing until a reload", async () => {
    const { moduleInBrowser } = await import("./browser.ts")
    init.mockRejectedValueOnce(new Error("WASM download interrupted"))
    const first = await moduleInBrowser("service : {}")
    expect(first.ok).toBe(false)

    init.mockResolvedValueOnce(undefined)
    const second = await moduleInBrowser("service : {}")
    expect(second).toEqual({ ok: true, module: "// module" })
    expect(init).toHaveBeenCalledTimes(2)
  })
})
