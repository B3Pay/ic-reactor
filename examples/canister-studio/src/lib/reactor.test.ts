// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createAppClient, toVars } from "./reactor.ts"

describe("toVars", () => {
  it("follows the builders' convention: nothing, the value, or the tuple", () => {
    expect(toVars([])).toBeUndefined()
    expect(toVars([5n])).toBe(5n)
    const record = { owner: "aaaaa-aa" }
    expect(toVars([record])).toBe(record)
    expect(toVars([null])).toBeNull()
    const values = [1, "two"] as const
    const vars = toVars(values)
    expect(vars).toEqual([1, "two"])
    expect(vars).not.toBe(values)
  })
})

describe("createAppClient", () => {
  it("makes a mainnet client that keeps reads fresh for a minute", () => {
    const client = createAppClient()
    try {
      expect(client.network).toBe("ic")
      // On a server the client is anonymous and never builds the auth.
      expect(client.authState().status).toBe("anonymous")
      const defaults = client.queryClient.getQueryDefaults([
        "ic-reactor",
        "ic",
        "2vxsx-fae",
        "ryjl3-tyaaa-aaaaa-aaaba-cai",
        "icrc1_fee",
        "4449444c0000",
      ])
      expect(defaults.staleTime).toBe(60_000)
      // The client's own defaults (read retry, serializers) are untouched.
      const own = client.queryClient.getDefaultOptions()
      expect(own.dehydrate?.serializeData).toBeTypeOf("function")
      expect(own.hydrate?.deserializeData).toBeTypeOf("function")
    } finally {
      client.dispose()
    }
  })

  it("makes a new client per call", () => {
    const a = createAppClient()
    const b = createAppClient()
    try {
      expect(a).not.toBe(b)
      expect(a.queryClient).not.toBe(b.queryClient)
    } finally {
      a.dispose()
      b.dispose()
    }
  })
})
