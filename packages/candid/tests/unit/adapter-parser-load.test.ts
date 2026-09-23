import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CandidAdapter } from "../../src/adapter.js"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * The adapter imports @ic-reactor/parser on the first parse and marked the
 * load as attempted before it finished. A parse that started meanwhile found
 * it attempted, did not wait, and sent the Candid to the didjs canister
 * instead: the second of two concurrent initialize() calls, every signature
 * but the first in registerMethods() on a fresh reactor, and every reactor
 * but the first sharing one adapter. Offline, or on a local replica with no
 * didjs canister, those calls failed although the local parser was there.
 * In a browser the web build's init() fetches the WASM, so the window lasts
 * a network round trip; here init() waits until the test lets it finish.
 */

const parser = vi.hoisted(() => {
  let finish: () => void = () => {}
  let ready = false
  return {
    /** A new load whose init() waits for `release()`. */
    reset() {
      ready = false
      const gate = new Promise<void>((resolve) => {
        finish = () => {
          ready = true
          resolve()
        }
      })
      return gate
    },
    gate: undefined as Promise<void> | undefined,
    release: () => finish(),
    isReady: () => ready,
  }
})

vi.mock("@ic-reactor/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ic-reactor/parser")>()
  return {
    ...actual,
    // Like the web build: nothing works until init() has resolved.
    default: async () => {
      await parser.gate
    },
    didToJs: (source: string) => {
      if (!parser.isReady()) {
        throw new TypeError("parser used before init() resolved")
      }
      return actual.didToJs(source)
    },
  }
})

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    isLocal: false,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

/** Loads start gated; the gate opens on the next macrotask. */
function gateParserLoad() {
  parser.gate = parser.reset()
  setTimeout(() => parser.release(), 0)
}

/** Fails the test if a parse goes to the didjs canister. */
function offline(adapter: CandidAdapter) {
  return vi
    .spyOn(adapter, "compileRemote")
    .mockRejectedValue(new Error("the didjs canister is unreachable"))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("CandidAdapter parser load", () => {
  it("parses concurrent sources locally while the parser loads", async () => {
    gateParserLoad()
    const adapter = new CandidAdapter({
      clientManager: createMockClientManager(),
    })
    const remote = offline(adapter)

    const [a, b, c] = await Promise.all([
      adapter.parseCandidSource("service : { a : () -> () }"),
      adapter.parseCandidSource("service : { b : () -> () }"),
      adapter.parseCandidSource("service : { c : () -> () }"),
    ])

    expect(remote).not.toHaveBeenCalled()
    expect(a.idlFactory).toBeTypeOf("function")
    expect(b.idlFactory).toBeTypeOf("function")
    expect(c.idlFactory).toBeTypeOf("function")
  })

  it("returns from loadParser() once a load already under way is done", async () => {
    gateParserLoad()
    const adapter = new CandidAdapter({
      clientManager: createMockClientManager(),
    })
    offline(adapter)

    const parsing = adapter.parseCandidSource("service : { a : () -> () }")
    await adapter.loadParser()

    expect(adapter.hasParser).toBe(true)
    expect(adapter.compileLocal("service : { b : () -> () }")).toContain(
      "idlFactory"
    )
    await parsing
  })
})

describe.each([
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const)("%s while the parser loads", (_name, Reactor) => {
  it("initializes twice at once", async () => {
    gateParserLoad()
    const reactor = new Reactor({
      name: "greeter",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: "service : { greet : (text) -> (text) query }",
    })
    const remote = offline(reactor.adapter)

    await expect(
      Promise.all([reactor.initialize(), reactor.initialize()])
    ).resolves.toEqual([undefined, undefined])

    expect(remote).not.toHaveBeenCalled()
    expect(reactor.getInputMeta("greet")?.argCount).toBe(1)
  })

  it("registers several methods at once on a fresh reactor", async () => {
    gateParserLoad()
    const reactor = new Reactor({
      name: "dynamic",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      idlFactory: ({
        IDL,
      }: {
        IDL: typeof import("@icp-sdk/core/candid").IDL
      }) => IDL.Service({}),
    })
    const remote = offline(reactor.adapter)

    await reactor.registerMethods([
      { functionName: "a", candid: "() -> (nat) query" },
      { functionName: "b", candid: "(text) -> (bool)" },
      { functionName: "c", candid: "(nat, nat) -> (nat) query" },
    ])

    expect(remote).not.toHaveBeenCalled()
    expect(reactor.getMethodNames().sort()).toEqual(["a", "b", "c"])
  })

  it("initializes reactors that share one adapter at once", async () => {
    gateParserLoad()
    const clientManager = createMockClientManager()
    const adapter = new CandidAdapter({ clientManager })
    const remote = offline(adapter)
    const reactors = ["ledger", "index", "archive"].map(
      (name) =>
        new Reactor({
          name,
          canisterId: "aaaaa-aa",
          clientManager,
          adapter,
          candid: `service : { ${name} : () -> (nat) query }`,
        })
    )

    await Promise.all(reactors.map((reactor) => reactor.initialize()))

    expect(remote).not.toHaveBeenCalled()
    expect(reactors.map((reactor) => reactor.getMethodNames())).toEqual([
      ["ledger"],
      ["index"],
      ["archive"],
    ])
  })
})
