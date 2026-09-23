import { describe, it, expect, afterEach, vi } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

const CANISTER_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

/**
 * Runs as a dedicated web worker whose script is `href`: the global scope has
 * `self` and `location` (a WorkerLocation), and no `window`.
 */
const inWorker = (href: string) => {
  const url = new URL(href)
  vi.stubGlobal("self", globalThis)
  vi.stubGlobal("location", {
    href,
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
  })
}

/** Runs as a page served from `origin`. */
const onPage = (origin: string) =>
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })

const construct = (host?: string) =>
  new ClientManager({
    queryClient: new QueryClient(),
    ...(host ? { agentOptions: { host } } : {}),
  })

/**
 * A page served by a local replica or a dev server routes the agent through
 * its own origin, and so does one on an IC boundary domain. The constructor
 * read that origin from `window.location` only. A web worker has no `window`,
 * so a `ClientManager` built in a worker the page started never saw the origin
 * and fell back to mainnet: the worker of a local dev page sent its calls,
 * with local canister IDs, to https://ic0.app while the page used its replica.
 * A worker's own `location` has the origin of the page that started it.
 */
describe("ClientManager in a web worker", () => {
  let fake: FakeReplica | undefined

  afterEach(() => {
    fake?.restore()
    fake = undefined
    vi.unstubAllGlobals()
  })

  it.each([
    [
      "a dev server's module worker",
      "http://localhost:5173",
      "http://localhost:5173/src/worker.ts?worker_file&type=module",
    ],
    [
      "a blob worker on a dev server page",
      "http://localhost:5173",
      "blob:http://localhost:5173/6f1c0b6e-2b1a-4f53-9d55-5a1c3f0e9a11",
    ],
    [
      "a worker served by the local replica",
      "http://bkyz2-fmaaa-aaaaa-qaaaq-cai.localhost:4943",
      "http://bkyz2-fmaaa-aaaaa-qaaaq-cai.localhost:4943/assets/worker.js",
    ],
    [
      "a worker on a boundary domain",
      "https://bkyz2-fmaaa-aaaaa-qaaaq-cai.icp0.io",
      "https://bkyz2-fmaaa-aaaaa-qaaaq-cai.icp0.io/assets/worker.js",
    ],
  ])("uses the same host as its page for %s", (_, pageOrigin, workerHref) => {
    onPage(pageOrigin)
    const page = construct()
    vi.unstubAllGlobals()

    inWorker(workerHref)
    const worker = construct()

    expect(worker.agentHost?.toString()).toBe(page.agentHost?.toString())
    expect(worker.network).toBe(page.network)
  })

  it("reaches the replica behind a local dev server", async () => {
    // The dev server at :5173 forwards /api to the local replica.
    fake = installFakeReplica({
      host: "http://localhost:5173",
      canisters: {
        [CANISTER_ID]: {
          query: () => new Uint8Array(IDL.encode([IDL.Text], ["local"])),
        },
      },
    })
    inWorker("http://localhost:5173/src/worker.ts?worker_file&type=module")

    const clientManager = construct()
    await clientManager.initialize()
    const backend = new Reactor<{ whoami: () => Promise<string> }>({
      clientManager,
      canisterId: CANISTER_ID,
      name: "backend",
      idlFactory: ({ IDL }) =>
        IDL.Service({ whoami: IDL.Func([], [IDL.Text], ["query"]) }),
    })

    await expect(backend.callMethod({ functionName: "whoami" })).resolves.toBe(
      "local"
    )
    expect(fake.requests.map((request) => request.endpoint)).toContain("status")
  })

  it("keeps the default host for a worker on an ordinary web host", () => {
    // Guard: such a page keeps the default too; it cannot route agent calls.
    inWorker("https://app.example.com/assets/worker.js")

    expect(construct().agentHost?.toString()).toBe("https://ic0.app/")
  })

  it("keeps the default host for a worker whose origin is opaque", () => {
    // Guard: a data: URL worker reports the origin "null", as #510's pages do.
    vi.stubGlobal("self", globalThis)
    vi.stubGlobal("location", {
      href: "data:text/javascript,postMessage(1)",
      origin: "null",
      protocol: "data:",
    })

    expect(construct().agentHost?.toString()).toBe("https://ic0.app/")
  })

  it("keeps an explicit host", () => {
    // Guard.
    inWorker("http://localhost:5173/src/worker.ts")

    expect(construct("https://icp-api.io").agentHost?.toString()).toBe(
      "https://icp-api.io/"
    )
  })

  it("constructs where reading location throws", () => {
    // Guard: Deno 2 has no `window`, and its `location` throws when read
    // unless it was started with --location.
    vi.stubGlobal("window", undefined)
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location")
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      get() {
        throw new ReferenceError(
          'Access to "location", run again with --location <href>.'
        )
      },
    })
    try {
      expect(construct().agentHost?.toString()).toBe("https://ic0.app/")
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "location", descriptor)
      } else {
        delete (globalThis as { location?: unknown }).location
      }
    }
  })
})
