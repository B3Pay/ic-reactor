import type { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it, vi } from "vitest"
import { CandidAdapter } from "../../src/adapter.js"
import { CandidReactor } from "../../src/reactor.js"

/**
 * fetchCandidSource tries the canister's candid:service metadata, then the
 * __get_candid_interface_tmp_hack query, and threw "Failed to retrieve Candid
 * source by any method." when neither worked. Both errors were dropped, so a
 * canister without Candid, a network outage and a local agent that never
 * fetched its root key all read the same.
 */

const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** A fetch that fails the way undici does when the host is unreachable. */
const offline = (() =>
  Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch

function adapterFor(agent: HttpAgent, isLocal = false) {
  return new CandidAdapter({
    clientManager: { agent, isLocal, subscribe: () => () => {} },
  })
}

describe("CandidAdapter fetch errors", () => {
  it("names the missing root key of a local agent nobody initialized", async () => {
    // What ClientManager builds for a local replica, before initialize()
    // fetches the root key.
    const agent = HttpAgent.createSync({
      host: "http://127.0.0.1:4943",
      shouldFetchRootKey: true,
      fetch: offline,
      retryTimes: 0,
    })

    const failure = adapterFor(agent, true).getCandidDefinition(LEDGER)

    await expect(failure).rejects.toThrow(LEDGER)
    await expect(failure).rejects.toThrow("Agent is missing root key")
    await expect(failure).rejects.toThrow("fetch failed")
  })

  it("names the network failure", async () => {
    const agent = HttpAgent.createSync({
      host: "https://icp-api.io",
      fetch: offline,
      retryTimes: 0,
    })

    await expect(adapterFor(agent).fetchCandidSource(LEDGER)).rejects.toThrow(
      /^Failed to retrieve Candid source by any method: .*fetch failed/s
    )
  })

  it("reaches CandidReactor.initialize()", async () => {
    const agent = HttpAgent.createSync({
      host: "https://icp-api.io",
      fetch: offline,
      retryTimes: 0,
    })
    const reactor = new CandidReactor({
      name: "ledger",
      canisterId: LEDGER,
      clientManager: {
        agent,
        isLocal: false,
        registerCanisterId: () => {},
        subscribe: () => () => {},
      } as unknown as ClientManager,
    })

    await expect(reactor.initialize()).rejects.toThrow("fetch failed")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Every combination of what the two sources can do
// ════════════════════════════════════════════════════════════════════════════

type Outcome =
  | { kind: "candid"; source: string }
  | { kind: "none" }
  | { kind: "throws"; error: Error }

const METADATA: Outcome[] = [
  { kind: "candid", source: "service : { from_metadata : () -> () }" },
  { kind: "none" },
  { kind: "throws", error: new Error("certificate verification failed") },
]
const TMP_HACK: Outcome[] = [
  { kind: "candid", source: "service : { from_tmp_hack : () -> () }" },
  { kind: "none" },
  {
    kind: "throws",
    error: new Error('Query failed: {"reject_message":"Canister not found"}'),
  },
]

function stub(outcome: Outcome): () => Promise<string | undefined> {
  return () => {
    switch (outcome.kind) {
      case "candid":
        return Promise.resolve(outcome.source)
      case "none":
        return Promise.resolve(undefined)
      case "throws":
        return Promise.reject(outcome.error)
    }
  }
}

describe("fetchCandidSource outcomes", () => {
  const agent = HttpAgent.createSync({ host: "https://icp-api.io" })

  for (const metadata of METADATA) {
    for (const tmpHack of TMP_HACK) {
      it(`metadata ${metadata.kind}, tmp hack ${tmpHack.kind}`, async () => {
        const adapter = adapterFor(agent)
        vi.spyOn(adapter, "fetchFromMetadata").mockImplementation(
          stub(metadata)
        )
        vi.spyOn(adapter, "fetchFromTmpHack").mockImplementation(
          stub(tmpHack) as () => Promise<string>
        )

        const fetched = adapter.fetchCandidSource(LEDGER)

        if (metadata.kind === "candid") {
          await expect(fetched).resolves.toBe(metadata.source)
        } else if (tmpHack.kind === "candid") {
          await expect(fetched).resolves.toBe(tmpHack.source)
        } else {
          await expect(fetched).rejects.toThrow(
            "Failed to retrieve Candid source by any method"
          )
          for (const outcome of [metadata, tmpHack]) {
            if (outcome.kind === "throws") {
              await expect(fetched).rejects.toThrow(outcome.error.message)
            }
          }
        }
      })
    }
  }
})
