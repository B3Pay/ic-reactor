import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

const build = vi.hoisted(() => ({ dev: true }))

// Whether this is a development build. vitest always reports one through
// `import.meta.env.DEV`, and each module reads its own copy of that object, so
// a test cannot change it for `ClientManager`; it is set here instead.
vi.mock("../src/utils/helper.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/helper.js")>()),
  isDev: () => build.dev,
}))

const MAINNET = "https://icp-api.io"
const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const FORGED_BALANCE = 1_000_000_000_000n

/** Run as a browser page served from `origin`, a `vite dev` server by default. */
const onPage = (origin = "http://localhost:5173") =>
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })

const verifies = (manager: ClientManager) =>
  manager.agent.config.verifyQuerySignatures

/**
 * A subnet's nodes sign every query response, and an agent checks those
 * signatures against node keys certified under the root key it holds. For
 * mainnet that key is built into the agent, so the check is what stops a
 * boundary node or anything else on the path from answering a query in the
 * subnet's name.
 *
 * `ClientManager` turned the check off by default in any development build
 * running in a browser, whatever the agent host. A `vite dev` page pointed at
 * mainnet, or a development build served from a boundary domain, took
 * whatever answer came back. The default was written for a local replica
 * (until 32e4d6370 it applied only where the `ic_env` cookie of a local dev
 * server was in use), where the agent fetches the root key from the replica
 * itself, so checking signatures under that key adds little.
 */
describe("ClientManager query signature verification in a development build", () => {
  let fake: FakeReplica | undefined

  beforeEach(() => {
    build.dev = true
  })

  afterEach(() => {
    fake?.restore()
    fake = undefined
    vi.unstubAllGlobals()
  })

  it("refuses a mainnet query answer that no mainnet node signed", async () => {
    // Answers for mainnet with a node key and a root key of its own: what a
    // party on the path could send.
    fake = installFakeReplica({
      host: MAINNET,
      canisters: {
        [LEDGER]: {
          query: () => new Uint8Array(IDL.encode([IDL.Nat], [FORGED_BALANCE])),
        },
      },
    })
    onPage()

    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: MAINNET },
    })
    const ledger = new Reactor<{ balance: () => Promise<bigint> }>({
      clientManager,
      canisterId: LEDGER,
      name: "ledger",
      idlFactory: ({ IDL }) =>
        IDL.Service({ balance: IDL.Func([], [IDL.Nat], ["query"]) }),
    })

    const outcome = await ledger.callMethod({ functionName: "balance" }).then(
      (balance) => ({ balance }),
      (error: unknown) => ({ error })
    )

    expect(outcome).not.toEqual({ balance: FORGED_BALANCE })
    expect(outcome).toHaveProperty("error")
    // It asked for the subnet's node keys, which is the check running.
    expect(fake.requests.map((request) => request.endpoint)).toContain(
      "read_state"
    )
  })

  it.each([
    [
      "a dev server page with a mainnet host",
      "http://localhost:5173",
      { host: MAINNET },
    ],
    [
      "a page on a boundary domain, with no host option",
      "https://bkyz2-fmaaa-aaaaa-qaaaq-cai.icp0.io",
      {},
    ],
    [
      "a page on its own domain with a mainnet host",
      "https://app.example.com",
      { host: "https://ic0.app" },
    ],
  ])("verifies by default for %s", (_, origin, agentOptions) => {
    onPage(origin)

    const manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions,
    })

    expect(manager.network).toBe("ic")
    expect(verifies(manager)).toBe(true)
  })

  it("still skips the check by default for a local replica", () => {
    // Guard: the local default is unchanged, both for a replica named in
    // `host` and for one serving the page.
    onPage()
    const configured = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:4943" },
    })

    onPage("http://bkyz2-fmaaa-aaaaa-qaaaq-cai.localhost:4943")
    const served = new ClientManager({ queryClient: new QueryClient() })

    expect(configured.network).toBe("local")
    expect(verifies(configured)).toBe(false)
    expect(served.network).toBe("local")
    expect(verifies(served)).toBe(false)
  })

  it("keeps an explicit setting for mainnet", () => {
    // Guard: a caller who turns the check off still gets that.
    onPage()

    const manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: MAINNET, verifyQuerySignatures: false },
    })

    expect(verifies(manager)).toBe(false)
  })

  it("verifies by default outside a development build, local or not", () => {
    // Guard: production builds are unchanged.
    build.dev = false
    onPage()

    const mainnet = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: MAINNET },
    })
    const local = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:4943" },
    })

    expect(verifies(mainnet)).toBe(true)
    expect(verifies(local)).toBe(true)
  })
})
