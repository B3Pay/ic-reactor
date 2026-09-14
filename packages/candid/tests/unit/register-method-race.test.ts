import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { CandidReactor } from "../../src/reactor.js"
import { CandidDisplayReactor } from "../../src/display-reactor.js"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import type {
  CandidReactorParameters,
  DynamicMethodOptions,
} from "../../src/types.js"

/**
 * registerMethod() checks for an existing method, awaits the Candid parse, and
 * then adds the method. registerMethods() runs its registrations in parallel,
 * so two registrations of one name both passed the check before either added
 * anything, and getMethodNames() listed the name twice (#439).
 */

function createMockClientManager(): ClientManager {
  return {
    agent: HttpAgent.createSync({ host: "https://ic0.app" }),
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

/** What the four classes share for registration. */
interface Registrar {
  initialize(): Promise<void>
  registerMethod(options: DynamicMethodOptions): Promise<void>
  registerMethods(methods: DynamicMethodOptions[]): Promise<void>
  getMethodNames(): string[]
}

const reactors: Array<
  [string, new (config: CandidReactorParameters) => Registrar]
> = [
  ["CandidReactor", CandidReactor],
  ["CandidDisplayReactor", CandidDisplayReactor],
  ["MetadataReactor", MetadataReactor],
  ["MetadataDisplayReactor", MetadataDisplayReactor],
]

describe.each(reactors)("%s.registerMethods", (_name, Reactor) => {
  async function initialized() {
    const reactor = new Reactor({
      name: "race",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: "service : { greet : (text) -> (text) query }",
    })
    await reactor.initialize()
    return reactor
  }

  it("registers a name given twice in one call once", async () => {
    const reactor = await initialized()

    await reactor.registerMethods([
      { functionName: "ping", candid: "() -> (text) query" },
      { functionName: "ping", candid: "() -> (text) query" },
    ])

    expect(reactor.getMethodNames()).toEqual(["greet", "ping"])
  })

  it("registers a name once when separate calls overlap", async () => {
    const reactor = await initialized()

    await Promise.all([
      reactor.registerMethod({
        functionName: "ping",
        candid: "() -> (text) query",
      }),
      reactor.registerMethod({
        functionName: "ping",
        candid: "() -> (text) query",
      }),
      reactor.registerMethod({
        functionName: "ping",
        candid: "() -> (text) query",
      }),
    ])

    expect(reactor.getMethodNames().filter((name) => name === "ping")).toEqual([
      "ping",
    ])
  })
})
