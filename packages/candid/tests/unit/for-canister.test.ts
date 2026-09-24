import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { CandidReactor } from "../../src/reactor.js"
import { CandidDisplayReactor } from "../../src/display-reactor.js"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import type { CandidReactorParameters } from "../../src/types.js"

/**
 * `forCanister` builds a sibling with the reactor's own class, from the
 * options `siblingParameters` returns. The candid reactors take more than a
 * Reactor does: their Candid source and adapter, and for the metadata
 * reactors the metadata built from the interface. Each sibling must come out
 * ready to call, as the reactor it was made from is, with an interface of its
 * own, so a method registered on one later does not half-appear on the other.
 */

/** The agent of each mock manager, newest last. */
const createdAgents: HttpAgent[] = []

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  createdAgents.push(agent)
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const GREETER = "service : { greet : (text) -> (text) query }"
const FIRST = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const SECOND = "mxzaz-hqaaa-aaaar-qaada-cai"

interface CandidFamily {
  canisterId: { toText(): string }
  adapter: unknown
  transform: string
  initialize(): Promise<void>
  hasMethod(name: string): boolean
  registerMethod(options: {
    functionName: string
    candid: string
  }): Promise<void>
  forCanister(canisterId: string): CandidFamily
  callMethod(params: {
    functionName: string
    args?: unknown[]
  }): Promise<unknown>
}

const classes: Array<
  [string, new (config: CandidReactorParameters) => CandidFamily, string]
> = [
  ["CandidReactor", CandidReactor, "candid"],
  ["CandidDisplayReactor", CandidDisplayReactor, "display"],
  ["MetadataReactor", MetadataReactor, "metadata"],
  ["MetadataDisplayReactor", MetadataDisplayReactor, "metadataDisplay"],
]

describe.each(classes)("%s.forCanister", (_name, ReactorClass, transform) => {
  async function initialized() {
    const reactor = new ReactorClass({
      name: "greeter",
      canisterId: FIRST,
      clientManager: createMockClientManager(),
      candid: GREETER,
    })
    await reactor.initialize()
    return reactor
  }

  it("is the same class, with the interface and adapter it had", async () => {
    const first = await initialized()
    const second = first.forCanister(SECOND)

    expect(second).toBeInstanceOf(ReactorClass)
    expect(second.canisterId.toText()).toBe(SECOND)
    expect(second.transform).toBe(transform)
    expect(second.hasMethod("greet")).toBe(true)
    expect(second.adapter).toBe(first.adapter)
    expect(first.forCanister(SECOND)).toBe(second)
  })

  it("sends its calls to its own canister", async () => {
    const first = await initialized()
    const second = first.forCanister(SECOND)
    // Both share the manager's agent; the canister each call names is what
    // tells them apart.
    const query = vi
      .spyOn(createdAgents[createdAgents.length - 1], "query")
      .mockResolvedValue({
        status: "replied",
        reply: { arg: IDL.encode([IDL.Text], ["hello"]) },
      } as never)

    await second.callMethod({ functionName: "greet", args: ["world"] })
    await first.callMethod({ functionName: "greet", args: ["world"] })

    expect(
      query.mock.calls.map(([canister]: unknown[]) => String(canister))
    ).toEqual([SECOND, FIRST])
  })

  it("keeps a method registered on the original afterwards to the original", async () => {
    const first = await initialized()
    const second = first.forCanister(SECOND)

    await first.registerMethod({
      functionName: "farewell",
      candid: "(text) -> (text) query",
    })

    expect(first.hasMethod("farewell")).toBe(true)
    expect(second.hasMethod("farewell")).toBe(false)
  })

  it("re-reads the same Candid source on initialize()", async () => {
    const first = await initialized()
    const second = first.forCanister(SECOND)
    const parse = vi.spyOn(first.adapter as never, "parseCandidSource")

    await second.initialize()

    expect(parse).toHaveBeenCalledWith(GREETER)
    expect(second.hasMethod("greet")).toBe(true)
  })
})

describe("metadata of a sibling", () => {
  it("MetadataReactor builds its metadata from the interface it got", async () => {
    const first = new MetadataReactor({
      name: "greeter",
      canisterId: FIRST,
      clientManager: createMockClientManager(),
      candid: GREETER,
    })
    await first.initialize()

    const second = first.forCanister(SECOND)

    expect(second.getInputMeta("greet")).toBeDefined()
    expect(second.getOutputMeta("greet")).toBeDefined()
  })

  it("MetadataDisplayReactor builds its metadata from the interface it got", async () => {
    const first = new MetadataDisplayReactor({
      name: "greeter",
      canisterId: FIRST,
      clientManager: createMockClientManager(),
      candid: GREETER,
    })
    await first.initialize()

    const second = first.forCanister(SECOND)

    expect(second.getInputMeta("greet")).toBeDefined()
    expect(second.getOutputMeta("greet")).toBeDefined()
  })

  it("CandidDisplayReactor passes its validators on", async () => {
    const first = new CandidDisplayReactor({
      name: "greeter",
      canisterId: FIRST,
      clientManager: createMockClientManager(),
      candid: GREETER,
    })
    await first.initialize()
    first.registerValidator("greet", () => ({ success: true }))

    expect(first.forCanister(SECOND).hasValidator("greet")).toBe(true)
  })
})
