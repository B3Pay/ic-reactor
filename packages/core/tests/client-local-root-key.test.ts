import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IC_ROOT_KEY } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { uint8ArrayToHex } from "../src/utils/helper.js"
import { installFakeReplica, type FakeReplica } from "../src/testing/index.js"

/**
 * A local replica certifies its answers with its own root key, not mainnet's.
 * `ClientManager.initializeAgent()` fetches that key, but until it had
 * finished the agent held the mainnet key it was built with and checked every
 * certificate against it. A call made in that window failed verification: an
 * update call ran on the replica and was then reported as a failed call, which
 * invites a retry that runs it twice, and a query failed outright.
 *
 * Nothing in the library waits for `initialize()` before a call. React hooks
 * fetch on mount, `useAuth` starts `initialize()` from an effect, and a script
 * can simply forget it, so the window is easy to hit. The `ic_env` cookie
 * closes it when a dev server sets one; nothing else did.
 */

const HOST = "http://127.0.0.1:4943"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    increment: IDL.Func([], [IDL.Nat], []),
    read: IDL.Func([], [IDL.Nat], ["query"]),
  })

interface Counter {
  increment: () => Promise<bigint>
  read: () => Promise<bigint>
}

let replica: FakeReplica
let executions = 0n

beforeEach(() => {
  executions = 0n
  replica = installFakeReplica({
    host: HOST,
    canisters: {
      [CANISTER]: {
        update: () => new Uint8Array(IDL.encode([IDL.Nat], [++executions])),
        query: () => new Uint8Array(IDL.encode([IDL.Nat], [executions])),
      },
    },
  })
})

afterEach(() => {
  replica.restore()
})

const counterOn = (clientManager: ClientManager) =>
  new Reactor<Counter>({
    clientManager,
    name: "counter",
    canisterId: CANISTER,
    idlFactory,
  })

const localManager = (agentOptions = {}) =>
  new ClientManager({
    queryClient: new QueryClient(),
    // A refused certificate is final; retrying it only slows the test down.
    agentOptions: { host: HOST, retryTimes: 0, ...agentOptions },
  })

const endpoints = () => replica.requests.map((request) => request.endpoint)

describe("a local replica's root key", () => {
  it("is fetched before an update call made before initialize()", async () => {
    const counter = counterOn(localManager())

    await expect(
      counter.callMethod({ functionName: "increment" })
    ).resolves.toBe(1n)

    expect(executions).toBe(1n)
    expect(endpoints()).toEqual(["status", "call"])
  })

  it("is fetched before a query made before initialize()", async () => {
    const counter = counterOn(localManager())

    await expect(counter.callMethod({ functionName: "read" })).resolves.toBe(0n)
  })

  it("is fetched once when a call races initialize()", async () => {
    const clientManager = localManager()
    const counter = counterOn(clientManager)

    const [, result] = await Promise.all([
      clientManager.initialize(),
      counter.callMethod({ functionName: "increment" }),
    ])

    expect(result).toBe(1n)
    expect(endpoints().filter((endpoint) => endpoint === "status")).toEqual([
      "status",
    ])
    expect(clientManager.agentState.isInitialized).toBe(true)
  })

  it("is still fetched by initialize() itself", async () => {
    // Guard: the explicit initialization keeps working as before.
    const clientManager = localManager()
    await clientManager.initialize()

    expect(clientManager.agent.rootKey).toEqual(replica.rootKey)
    await expect(
      counterOn(clientManager).callMethod({ functionName: "increment" })
    ).resolves.toBe(1n)
  })

  it("is not fetched when the caller supplies one", async () => {
    // Guard: an explicit root key is used as given.
    const counter = counterOn(localManager({ rootKey: replica.rootKey }))

    await expect(
      counter.callMethod({ functionName: "increment" })
    ).resolves.toBe(1n)
    expect(endpoints()).toEqual(["call"])
  })

  it("is not fetched when the caller opts out", async () => {
    // Guard: `shouldFetchRootKey: false` is the caller's to set. The agent
    // then keeps the mainnet key, which this replica's certificate fails.
    const counter = counterOn(localManager({ shouldFetchRootKey: false }))

    await expect(
      counter.callMethod({ functionName: "increment" })
    ).rejects.toThrow(/Certificate verification error/)
    expect(endpoints()).toEqual(["call"])
  })
})

describe("a mainnet host", () => {
  it("keeps the pinned mainnet root key", () => {
    // Guard: taking a root key from the network is only acceptable for a
    // local replica; mainnet's is pinned in the agent.
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })

    expect(uint8ArrayToHex(clientManager.agent.rootKey!)).toBe(IC_ROOT_KEY)
  })
})
