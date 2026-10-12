// @vitest-environment node
// The method page's loader for links that ask to run a method
// (`?method=…&args=<hex>&run=true`): shared links, quick reads and history
// replays. It reads at once only what the runner reads at once, and nothing
// it is given can fail the page.
import { createTestClient } from "@ic-reactor/core/testing"
import { afterEach, describe, expect, it } from "vitest"
import { compileInterface } from "../../interface/compile.ts"
import { serverCli } from "../../interface/compile.server.ts"
import { interfaceFromPayload } from "../../interface/load.ts"
import type { InterfacePayload } from "../../interface/types.ts"
import { sha256Hex } from "../../lib/hex.ts"
import { Route } from "../../routes/canister.$canisterId.index.tsx"

const ID = "qoctq-giaaa-aaaaa-aaaea-cai"
const DID = `service : {
  ping : () -> () query;
  greet : (text) -> (text) query;
  peers : () -> (vec text) composite_query;
  bump : () -> (nat);
}`
// DIDL, an empty type table and no values: the arguments of `ping`.
const NO_ARGS = "4449444c0000"
// "DIDL", the type `text`, and the value "bob".
const GREET_BOB = "4449444c00017103626f62"

type Payload = Extract<InterfacePayload, { ok: true }>

async function payloadOf(did: string): Promise<Payload> {
  const compiled = await compileInterface(serverCli, did)
  if (!compiled.ok) throw new Error(`does not compile: ${compiled.message}`)
  return {
    ok: true,
    canisterId: ID,
    source: { kind: "metadata", certified: true, moduleHash: null },
    did,
    didSha256: await sha256Hex(new TextEncoder().encode(did)),
    envelopeJson: compiled.envelopeJson,
    docs: {},
    fetchedAt: 0,
    cache: "miss",
  }
}

type Loader = (ctx: unknown) => Promise<unknown>
const loader = (Route.options as unknown as { loader: Loader }).loader

let test: ReturnType<typeof createTestClient> | undefined
afterEach(() => {
  test?.client.dispose()
  test = undefined
})

async function open(deps: {
  method: string
  args: string
  certified?: boolean
}): Promise<{ result: unknown; methods: string[] }> {
  const payload = await payloadOf(DID)
  const iface = interfaceFromPayload(payload)
  test = createTestClient({ network: "ic", signedIn: false })
  test.mock<Record<string, (...args: never[]) => Promise<unknown>>>(
    iface.actor,
    ID,
    {
      ping: () => undefined,
      greet: (name: string) => `hello ${name}`,
      peers: () => [],
      bump: () => 1n,
    } as never
  )
  const { client } = test
  const result = await loader({
    context: { reactor: client, queryClient: client.queryClient },
    params: { canisterId: ID },
    deps: { run: true, certified: false, ...deps },
    parentMatchPromise: Promise.resolve({ loaderData: { payload } }),
  })
  const methods = test.requests.flatMap((r) =>
    r.endpoint === "query" || r.endpoint === "call" ? [r.methodName ?? ""] : []
  )
  return { result, methods }
}

describe("the method page's loader, for a link with run=true", () => {
  it("opens a query without results without failing the page or calling it", async () => {
    // What a history Replay of `ping` (run as a call, kept as a query) links to.
    const { result, methods } = await open({ method: "ping", args: NO_ARGS })
    expect(result).toBeUndefined()
    expect(methods).toEqual([])
  })

  it("never sends an update from a link", async () => {
    const { methods } = await open({ method: "bump", args: NO_ARGS })
    expect(methods).toEqual([])
  })

  it("never reads a composite query certified", async () => {
    const { methods } = await open({
      method: "peers",
      args: NO_ARGS,
      certified: true,
    })
    expect(methods).toEqual([])
  })

  it("reads a query with results, under the key the runner asks for", async () => {
    const { methods } = await open({ method: "greet", args: GREET_BOB })
    expect(methods).toEqual(["greet"])
    const cached = test?.client.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.state.data)
    expect(cached).toEqual(["hello bob"])
  })
})
