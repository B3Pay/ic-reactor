/**
 * Fetching without `@icp-sdk/core`, the plugin's optional peer: the fetch
 * resolves with a message that says to install it, or to write the `.did`.
 */
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.doUnmock("@icp-sdk/core/agent")
  vi.resetModules()
})

it("says to install @icp-sdk/core when it cannot be loaded", async () => {
  vi.resetModules()
  vi.doMock("@icp-sdk/core/agent", () => {
    throw new Error("Cannot find package '@icp-sdk/core'\nimported from x")
  })
  const { fetchCandid } = await import("../src/fetch.js")
  const result = await fetchCandid({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    network: "ic",
    didFile: "did/ledger.did",
  })
  expect(result.ok).toBe(false)
  expect(!result.ok && result.message).toMatch(
    /^did\/ledger\.did does not exist, and fetching it from ryjl3-tyaaa-aaaaa-aaaba-cai on ic needs @icp-sdk\/core, which could not be loaded \(.*\)\. Install it next to @ic-reactor\/core \(npm install @icp-sdk\/core\), or write did\/ledger\.did yourself/
  )
})
