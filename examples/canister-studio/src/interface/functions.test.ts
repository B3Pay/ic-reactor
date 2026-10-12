import { describe, expect, it, vi } from "vitest"
import { REGISTRY } from "../lib/registry.ts"
import { didForTool, INTERFACE_CHANGED } from "./functions.ts"

const LIVE = "qoctq-giaaa-aaaaa-aaaea-cai"
const SHOWN = "ab".repeat(32)

describe("the .did an interface tool works on", () => {
  it("is the live one while it is still the one the page shows", async () => {
    const live = vi.fn(async () => ({
      ok: true as const,
      did: "service : {}",
      didSha256: SHOWN,
    }))
    await expect(didForTool(LIVE, SHOWN, live)).resolves.toEqual({
      ok: true,
      did: "service : {}",
    })
  })

  it("is refused once the canister was upgraded past the page's interface", async () => {
    const live = vi.fn(async () => ({
      ok: true as const,
      did: "service : { new_method : () -> () }",
      didSha256: "cd".repeat(32),
    }))
    await expect(didForTool(LIVE, SHOWN, live)).resolves.toEqual({
      ok: false,
      message: INTERFACE_CHANGED,
    })
  })

  it("is a registry canister's committed one, read from no canister", async () => {
    const entry = REGISTRY[0]!
    const live = vi.fn()
    await expect(didForTool(entry.id, SHOWN, live)).resolves.toEqual({
      ok: true,
      did: entry.did,
    })
    expect(live).not.toHaveBeenCalled()
  })
})
