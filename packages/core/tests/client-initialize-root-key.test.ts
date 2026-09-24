import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IC_ROOT_KEY } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { hexToUint8Array, uint8ArrayToHex } from "../src/utils/helper.js"
import { installFakeReplica, type FakeReplica } from "../src/testing/index.js"

/**
 * On a local host, `initialize()` fetched the replica's root key and replaced
 * whatever key the agent held, including one the caller passed as
 * `agentOptions.rootKey`. A key obtained out of band (PocketIC, a testnet, the
 * network behind a local proxy) was honoured only until `initialize()`
 * finished, calls checked one key before it and another after, and
 * `initialize()` failed whenever `/api/v2/status` could not be reached,
 * though the supplied key was all the calls needed (#713).
 *
 * An explicit key is now kept. A key from the `ic_env` cookie is still
 * replaced by the replica's own, `shouldFetchRootKey: false` alone still
 * fetches, and a mainnet host fetches nothing, as before.
 */

const HOST = "http://127.0.0.1:4943"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"
/** A key that is not the fake replica's. */
const OTHER_KEY = new Uint8Array(133).fill(7)

const cookie = vi.hoisted(() => ({
  env: undefined as Record<string, unknown> | undefined,
}))

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => cookie.env,
}))

let replica: FakeReplica

beforeEach(() => {
  replica = installFakeReplica({
    host: HOST,
    canisters: {
      [CANISTER]: {
        update: () => new Uint8Array(IDL.encode([IDL.Nat], [1n])),
      },
    },
  })
})

afterEach(() => {
  replica.restore()
  cookie.env = undefined
  vi.unstubAllGlobals()
})

const localManager = (agentOptions = {}, host = HOST) =>
  new ClientManager({
    queryClient: new QueryClient(),
    // A refused certificate is final; retrying it only slows the test down.
    agentOptions: { host, retryTimes: 0, ...agentOptions },
  })

const counterOn = (clientManager: ClientManager) =>
  new Reactor<{ increment: () => Promise<bigint> }>({
    clientManager,
    name: "counter",
    canisterId: CANISTER,
    idlFactory: ({ IDL }) =>
      IDL.Service({ increment: IDL.Func([], [IDL.Nat], []) }),
  })

const endpoints = () => replica.requests.map((request) => request.endpoint)

const hex = (key: Uint8Array | ArrayBuffer | null) =>
  key ? uint8ArrayToHex(new Uint8Array(key)) : null

describe("initialize() on a local host with agentOptions.rootKey", () => {
  it("keeps the key and requests no status", async () => {
    const clientManager = localManager({ rootKey: OTHER_KEY })

    await clientManager.initialize()

    expect(hex(clientManager.agent.rootKey)).toBe(hex(OTHER_KEY))
    expect(endpoints()).toEqual([])
    expect(clientManager.agentState.isInitialized).toBe(true)
  })

  it("keeps it with shouldFetchRootKey: false too", async () => {
    const clientManager = localManager({
      rootKey: OTHER_KEY,
      shouldFetchRootKey: false,
    })

    await clientManager.initialize()

    expect(hex(clientManager.agent.rootKey)).toBe(hex(OTHER_KEY))
    expect(endpoints()).toEqual([])
  })

  it("resolves when the status endpoint cannot be reached", async () => {
    // The fake answers for HOST only, so this host has no route at all.
    const clientManager = localManager(
      { rootKey: replica.rootKey },
      "http://127.0.0.1:4999"
    )

    await expect(clientManager.initialize()).resolves.toBe(clientManager)
    expect(clientManager.agentState.error).toBeUndefined()
  })

  it("verifies calls made after it against that key", async () => {
    // The visible side of keeping it: a key that is not the replica's fails
    // after initialize() as it did before, rather than only until then.
    // Mainnet's key is a valid BLS key that did not sign this replica's
    // certificates.
    const clientManager = localManager({
      rootKey: hexToUint8Array(IC_ROOT_KEY),
    })
    await clientManager.initialize()

    await expect(
      counterOn(clientManager).callMethod({ functionName: "increment" })
    ).rejects.toThrow(/Certificate verification error/)
  })

  it("lets calls verify against the replica's own key without a status request", async () => {
    const clientManager = localManager({ rootKey: replica.rootKey })
    await clientManager.initialize()

    await expect(
      counterOn(clientManager).callMethod({ functionName: "increment" })
    ).resolves.toBe(1n)
    expect(endpoints()).toEqual(["call"])
  })

  it("is reported by explicitRootKey", () => {
    expect(localManager({ rootKey: OTHER_KEY }).explicitRootKey).toBe(OTHER_KEY)
    expect(localManager().explicitRootKey).toBeUndefined()
  })
})

describe("initialize() still fetches the replica's key", () => {
  it("in place of a root key from the ic_env cookie", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173", protocol: "http:" },
    })
    cookie.env = { IC_ROOT_KEY: OTHER_KEY }
    const clientManager = localManager()
    expect(hex(clientManager.agent.rootKey)).toBe(hex(OTHER_KEY))
    expect(clientManager.explicitRootKey).toBeUndefined()

    await clientManager.initialize()

    expect(hex(clientManager.agent.rootKey)).toBe(hex(replica.rootKey))
    expect(endpoints()).toEqual(["status"])
  })

  it("with shouldFetchRootKey: false and no key", async () => {
    // Code written for agents where `false` was the default relies on
    // initialize() for the key.
    const clientManager = localManager({ shouldFetchRootKey: false })

    await clientManager.initialize()

    expect(hex(clientManager.agent.rootKey)).toBe(hex(replica.rootKey))
    expect(endpoints()).toEqual(["status"])
  })
})

describe("initialize() on a mainnet host", () => {
  it("fetches nothing and keeps a supplied key", async () => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io", rootKey: OTHER_KEY },
    })

    await clientManager.initialize()

    expect(hex(clientManager.agent.rootKey)).toBe(hex(OTHER_KEY))
    expect(hex(clientManager.agent.rootKey)).not.toBe(IC_ROOT_KEY)
  })
})
