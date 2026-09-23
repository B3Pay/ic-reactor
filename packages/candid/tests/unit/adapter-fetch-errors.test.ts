import type { ClientManager } from "@ic-reactor/core"
import {
  Cbor,
  HttpAgent,
  IC_RESPONSE_DOMAIN_SEPARATOR,
  hashOfMap,
  requestIdOf,
  type HttpAgentOptions,
} from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { CandidAdapter } from "../../src/adapter.js"
import { DEFAULT_LOCAL_DIDJS_ID } from "../../src/constants.js"
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
    error: new Error(
      `Query failed (reject code 3, error code IC0301): Canister ${LEDGER} not found`
    ),
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

// ════════════════════════════════════════════════════════════════════════════
// A query the replica rejects
// ════════════════════════════════════════════════════════════════════════════

/** What a replica rejects a query with. */
interface Reject {
  reject_code: number
  reject_message: string
  error_code: string
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * An agent whose queries a replica rejects with `reject`. The body is the one a
 * replica sends (interface spec, "Query call"): the reject code, message and
 * error code, and a node signature over them. The signature's timestamp is a
 * u64, which the agent decodes as a bigint and returns with the response.
 *
 * Nothing in the agent is stubbed, and it verifies the signature as it would a
 * replica's. The node key it checks against is put straight into its key
 * store, instead of being read from the subnet's certified state.
 */
function rejectingAgent(reject: Reject): HttpAgent {
  const node = Ed25519KeyIdentity.generate()
  const nodeKey = node.getPublicKey().toDer()
  const nodeId = Principal.selfAuthenticating(nodeKey)

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!url.pathname.endsWith("/query")) {
      return new Response(`no endpoint ${url.pathname}`, { status: 404 })
    }
    const body = new Uint8Array(
      await new Response(init?.body as BodyInit).arrayBuffer()
    )
    const { content } = Cbor.decode(body) as {
      content: Record<string, unknown>
    }
    const timestamp = BigInt(Date.now()) * 1_000_000n
    const hash = hashOfMap({
      status: "rejected",
      ...reject,
      timestamp,
      request_id: requestIdOf(content),
    })
    const signature = await node.sign(
      concatBytes(IC_RESPONSE_DOMAIN_SEPARATOR, hash)
    )
    const response = {
      status: "rejected",
      ...reject,
      signatures: [
        {
          timestamp,
          signature: new Uint8Array(signature),
          identity: nodeId.toUint8Array(),
        },
      ],
    }
    return new Response(Cbor.encode(response) as BodyInit, {
      headers: { "content-type": "application/cbor" },
    })
  }

  const nodeKeys: NonNullable<HttpAgentOptions["subnetNodeKeyExpirableStore"]> =
    {
      expirationTime: 60_000,
      get: () => Promise.resolve(new Map([[nodeId.toText(), nodeKey]])),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    }

  return HttpAgent.createSync({
    host: "https://icp-api.io",
    fetch: fetch as typeof globalThis.fetch,
    retryTimes: 0,
    subnetNodeKeyExpirableStore: nodeKeys,
  })
}

/** The message a promise rejects with. */
function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
}

describe("a query the replica rejects", () => {
  // The replica's reject for a method the canister doesn't export
  // (CanisterMethodNotFound, a CanisterError).
  const noTmpHack: Reject = {
    reject_code: 5,
    reject_message:
      `Error from Canister ${LEDGER}: ` +
      "Canister has no query method '__get_candid_interface_tmp_hack'.",
    error_code: "IC0536",
  }

  it("gives fetchFromTmpHack's error the reject message and codes", async () => {
    const adapter = adapterFor(rejectingAgent(noTmpHack))

    expect(await rejection(adapter.fetchFromTmpHack(LEDGER))).toBe(
      "Query failed (reject code 5, error code IC0536): " +
        `Error from Canister ${LEDGER}: ` +
        "Canister has no query method '__get_candid_interface_tmp_hack'."
    )
  })

  it("says why a canister without Candid has none", async () => {
    // No candid:service metadata and no tmp hack method, the case this error
    // is mostly read for. Its second half was "Do not know how to serialize a
    // BigInt".
    const adapter = adapterFor(rejectingAgent(noTmpHack))
    vi.spyOn(adapter, "fetchFromMetadata").mockResolvedValue(undefined)

    expect(await rejection(adapter.fetchCandidSource(LEDGER))).toBe(
      "Failed to retrieve Candid source by any method: " +
        "the candid:service metadata was not available; " +
        "calling __get_candid_interface_tmp_hack failed: " +
        "Query failed (reject code 5, error code IC0536): " +
        `Error from Canister ${LEDGER}: ` +
        "Canister has no query method '__get_candid_interface_tmp_hack'."
    )
  })

  it("gives compileRemote's error the didjs canister's reject", async () => {
    // The replica's reject for a canister that doesn't exist
    // (CanisterNotFound, a DestinationInvalid), here a local replica with no
    // didjs canister deployed.
    const adapter = adapterFor(
      rejectingAgent({
        reject_code: 3,
        reject_message: `Canister ${DEFAULT_LOCAL_DIDJS_ID} not found`,
        error_code: "IC0301",
      }),
      true
    )

    expect(await rejection(adapter.compileRemote("service : {}"))).toBe(
      "Query failed (reject code 3, error code IC0301): " +
        `Canister ${DEFAULT_LOCAL_DIDJS_ID} not found`
    )
  })
})
