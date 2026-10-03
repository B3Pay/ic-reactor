// Scenario 2: networks and the root-key rule.
import { createClient, isReactorError } from "@ic-reactor/core"
import { describe, expect, it } from "vitest"
import { UsageError } from "./input.ts"
import { LEDGERS, ledgerOn } from "./ledgers.ts"
import { networkFrom } from "./network.ts"
import { createCli } from "./test-kit.ts"

const ROOT_KEY =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100"

describe("--network onto createClient's network", () => {
  it("is mainnet by default and for ic, and the local replica for local", () => {
    expect(networkFrom(undefined, undefined)).toMatchObject({
      network: "ic",
      flags: [],
    })
    expect(networkFrom("ic", undefined).network).toBe("ic")
    expect(networkFrom("local", undefined).network).toBe("local")
  })

  it.each([
    "http://127.0.0.1:8001",
    "http://localhost:8000",
    "http://backend.localhost:4943",
    "http://[::1]:8000",
  ])("takes %s as a local replica whose key the client fetches", (url) => {
    expect(networkFrom(url, undefined).network).toEqual({
      host: new URL(url).origin,
    })
  })

  it("needs the root key of a replica that is not on this machine", () => {
    expect(() => networkFrom("https://replica.example.org", undefined)).toThrow(
      /--root-key/
    )
    expect(networkFrom("https://replica.example.org", ROOT_KEY)).toEqual({
      network: {
        host: "https://replica.example.org",
        rootKey: Uint8Array.from(Buffer.from(ROOT_KEY, "hex")),
      },
      rootKey: "given with --root-key, never fetched",
      flags: [
        "--network",
        "https://replica.example.org",
        "--root-key",
        ROOT_KEY,
      ],
    })
  })

  it("refuses what is not a network, and a root key for ic or local", () => {
    for (const [flag, key] of [
      ["mainnet", undefined],
      ["ftp://127.0.0.1", undefined],
      ["ic", ROOT_KEY],
      ["local", ROOT_KEY],
      ["https://replica.example.org", "xyz"],
    ] as const) {
      expect(() => networkFrom(flag, key)).toThrow(UsageError)
    }
  })

  it("refuses a remote URL without a key before any client is built (exit 2)", async () => {
    const { cli } = createCli()
    const result = await cli([
      "info",
      "--network",
      "https://replica.example.org",
      "--json",
    ])
    expect(result.exitCode).toBe(2)
    expect(result.options).toBeUndefined()
    expect(result.docs[0]).toMatchObject({
      ok: false,
      kind: "usage",
      message: expect.stringContaining("never fetched"),
    })
  })
})

/**
 * Where the real client sends its first request on each network: a `fetch`
 * that records the URL and fails, so nothing leaves the test.
 */
async function firstRequests(
  flag: string,
  rootKey?: string
): Promise<string[]> {
  const urls: string[] = []
  const client = createClient({
    network: networkFrom(flag, rootKey).network,
    identity: "anonymous",
    fetch: async (input) => {
      urls.push(input instanceof Request ? input.url : String(input))
      throw new TypeError("offline")
    },
  })
  try {
    await ledgerOn(client, LEDGERS.icp).icrc1_fee()
  } catch (error) {
    expect(isReactorError(error)).toBe(true)
  } finally {
    client.dispose()
  }
  return urls.map((url) => new URL(url).origin + new URL(url).pathname)
}

describe("the root key, as the client then behaves", () => {
  it("fetches it from a local replica, first", async () => {
    const urls = await firstRequests("http://127.0.0.1:8001")
    expect(urls[0]).toBe("http://127.0.0.1:8001/api/v2/status")
  })

  it("never fetches it on mainnet or from a remote replica given a key", async () => {
    const mainnet = await firstRequests("ic")
    const remote = await firstRequests("https://replica.example.org", ROOT_KEY)
    expect(mainnet.length).toBeGreaterThan(0)
    expect(mainnet.every((url) => url.startsWith("https://icp-api.io/"))).toBe(
      true
    )
    expect(remote.length).toBeGreaterThan(0)
    for (const url of [...mainnet, ...remote]) {
      expect(url).not.toMatch(/\/api\/v2\/status$/)
    }
  })
})
