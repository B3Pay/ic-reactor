import { describe, it, expect } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"

/**
 * `updateAgent` sweeps the cache of every canister the manager has been told
 * about. It used to do that with one filter per canister, and each filtered
 * cancel, remove, invalidate and refetch walks the whole query cache. A sign-in
 * therefore cost (registered canisters) x (cached queries): measured at 166 ms
 * with 1,000 token canisters holding 3 queries each, and 622 ms with 2,000,
 * all of it blocking the page in the middle of the login flow. Canisters are
 * registered by every reactor, every `setCanisterId` and every
 * `callConfig.canisterId` override, and none is ever removed, so a wallet that
 * has shown many tokens pays this on every sign-in and sign-out.
 */

/** A distinct canister ID for each index. */
const canisterId = (index: number) =>
  Principal.fromUint8Array(
    new Uint8Array([0, 0, 0, 0, (index >> 8) & 255, index & 255, 1, 1, 1, 1])
  ).toText()

/**
 * Registers `canisters` canisters with one cached query each, switches the
 * identity, and returns how many times the query cache was searched.
 */
function cacheScansForIdentitySwitch(canisters: number): number {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io" },
  })
  for (let index = 0; index < canisters; index++) {
    const id = canisterId(index)
    clientManager.registerCanisterId(id)
    queryClient.setQueryData([id, "icrc1_balance_of"], BigInt(index))
  }

  const cache = queryClient.getQueryCache()
  const findAll = cache.findAll.bind(cache)
  let scans = 0
  cache.findAll = (...args: Parameters<typeof findAll>) => {
    scans++
    return findAll(...args)
  }

  clientManager.updateAgent(Ed25519KeyIdentity.generate())
  return scans
}

describe("ClientManager.updateAgent with many registered canisters", () => {
  it("searches the query cache as often for 500 canisters as for one", () => {
    const forOne = cacheScansForIdentitySwitch(1)
    const forMany = cacheScansForIdentitySwitch(500)

    // A handful of passes, one per step of the sweep, whatever the count.
    expect(forOne).toBeGreaterThan(0)
    expect(forOne).toBeLessThanOrEqual(4)
    expect(forMany).toBe(forOne)
  })

  it("still clears every registered canister's entries and nothing else", () => {
    const queryClient = new QueryClient()
    const clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    const ids = Array.from({ length: 50 }, (_, index) => canisterId(index))
    for (const id of ids) {
      clientManager.registerCanisterId(id)
      queryClient.setQueryData([id, "icrc1_balance_of"], 1n)
    }
    const unregistered = [canisterId(999), "icrc1_name"]
    const appQuery = ["rest", "settings"]
    queryClient.setQueryData(unregistered, "kept")
    queryClient.setQueryData(appQuery, "kept")

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    for (const id of ids) {
      expect(queryClient.getQueryData([id, "icrc1_balance_of"])).toBeUndefined()
    }
    expect(queryClient.getQueryData(unregistered)).toBe("kept")
    expect(queryClient.getQueryData(appQuery)).toBe("kept")
  })
})
