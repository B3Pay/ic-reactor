import { describe, it, expect, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { installFakeReplica, type FakeReplica } from "../src/testing/index.js"

/**
 * Codespaces and Gitpod forward a local dev server and replica to the browser
 * over generated subdomains (`network` `"remote"`). Two things were wrong
 * there (#643):
 *
 * - With no `host` option, only a local or mainnet page origin was adopted,
 *   so a dev app in a codespace called mainnet with its local canister IDs.
 * - With a host, the `ic_env` cookie was trusted as on a local replica. But
 *   `app.github.dev` and the Gitpod cluster domains are not public suffixes:
 *   a page in a stranger's workspace can set `ic_env` for all of them.
 *
 * A remote page now routes through its origin, as a local one does, and its
 * cookie is trusted only with `allowEnvConfig: true`. The agent fetches the
 * replica's root key rather than taking the cookie's.
 */

const BACKEND = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
const COOKIE_CANISTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"
/** A key no replica holds, so taking it from the cookie is detectable. */
const COOKIE_ROOT_KEY = new Uint8Array(133).fill(7)

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => ({
    IC_ROOT_KEY: COOKIE_ROOT_KEY,
    "PUBLIC_CANISTER_ID:backend": COOKIE_CANISTER,
  }),
}))

const CODESPACE = "https://fluffy-space-5173.app.github.dev"
const GITPOD = "https://5173-user-repo-abc123.ws-us118.gitpod.io"

const onPage = (origin: string) =>
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })

const manager = (options: { allowEnvConfig?: boolean } = {}) =>
  new ClientManager({ queryClient: new QueryClient(), ...options })

const backendOn = (clientManager: ClientManager, canisterId?: string) =>
  new Reactor<{ whoami: () => Promise<string> }>({
    clientManager,
    name: "backend",
    ...(canisterId ? { canisterId } : {}),
    idlFactory: ({ IDL }) =>
      IDL.Service({ whoami: IDL.Func([], [IDL.Text], ["query"]) }),
  })

const sameBytes = (a: Uint8Array | null, b: Uint8Array) =>
  a !== null && a.length === b.length && a.every((byte, i) => byte === b[i])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("a Codespaces or Gitpod page with no host option", () => {
  it.each([
    ["Codespaces", CODESPACE],
    ["Gitpod", GITPOD],
  ])("routes through its own origin on %s", (_, origin) => {
    onPage(origin)

    const clientManager = manager()

    expect(clientManager.agentHost?.toString()).toBe(`${origin}/`)
    expect(clientManager.network).toBe("remote")
    expect(clientManager.isLocal).toBe(true)
  })

  it("reaches the replica behind its origin", async () => {
    const fake: FakeReplica = installFakeReplica({
      host: CODESPACE,
      canisters: {
        [BACKEND]: {
          query: () => new Uint8Array(IDL.encode([IDL.Text], ["codespace"])),
        },
      },
    })
    try {
      onPage(CODESPACE)
      const backend = backendOn(manager(), BACKEND)

      await expect(
        backend.callMethod({ functionName: "whoami" })
      ).resolves.toBe("codespace")
    } finally {
      fake.restore()
    }
  })
})

describe("the ic_env cookie on a Codespaces or Gitpod page", () => {
  it.each([
    ["Codespaces", CODESPACE],
    ["Gitpod", GITPOD],
  ])("is not trusted on %s without allowEnvConfig", (_, origin) => {
    onPage(origin)

    const clientManager = manager()

    expect(clientManager.trustsEnvConfig).toBe(false)
    expect(() => backendOn(clientManager)).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("is not trusted with an explicit host on another workspace domain", () => {
    onPage(CODESPACE)

    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://fluffy-space-4943.app.github.dev" },
    })

    expect(clientManager.trustsEnvConfig).toBe(false)
  })

  it("gives no root key to the agent, which fetches the replica's", async () => {
    const fake = installFakeReplica({ host: CODESPACE, canisters: {} })
    try {
      onPage(CODESPACE)
      const clientManager = manager()

      expect(clientManager.agent.rootKey).toBeNull()
      await clientManager.initialize()

      expect(fake.requests.map((request) => request.endpoint)).toEqual([
        "status",
      ])
      expect(sameBytes(clientManager.agent.rootKey, fake.rootKey)).toBe(true)
    } finally {
      fake.restore()
    }
  })

  it("is trusted with allowEnvConfig: true", () => {
    onPage(CODESPACE)

    const clientManager = manager({ allowEnvConfig: true })

    expect(clientManager.trustsEnvConfig).toBe(true)
    expect(backendOn(clientManager).canisterId.toText()).toBe(COOKIE_CANISTER)
    expect(sameBytes(clientManager.agent.rootKey, COOKIE_ROOT_KEY)).toBe(true)
  })
})

describe("local and mainnet pages are unchanged", () => {
  it.each([
    ["a vite dev server", "http://localhost:5173", "local"],
    ["a local asset canister", `http://${BACKEND}.localhost:4943`, "local"],
    ["a loopback address", "http://127.0.0.1:4943", "local"],
  ])("%s routes through its origin", (_, origin, network) => {
    onPage(origin)

    const clientManager = manager()

    expect(clientManager.agentHost?.toString()).toBe(`${origin}/`)
    expect(clientManager.network).toBe(network)
  })

  it("a mainnet boundary domain routes through its boundary", () => {
    onPage(`https://${BACKEND}.icp0.io`)

    const clientManager = manager()

    // The agent drops the canister's subdomain of a boundary domain itself.
    expect(clientManager.agentHost?.toString()).toBe("https://icp0.io/")
    expect(clientManager.network).toBe("ic")
  })

  it("an ordinary web host keeps the mainnet fallback", () => {
    onPage("https://my-dapp.vercel.app")

    expect(manager().agentHost?.toString()).toBe("https://ic0.app/")
  })

  it("a local page still trusts the cookie", () => {
    onPage("http://localhost:5173")

    const clientManager = manager()

    expect(clientManager.trustsEnvConfig).toBe(true)
    expect(backendOn(clientManager).canisterId.toText()).toBe(COOKIE_CANISTER)
  })
})
