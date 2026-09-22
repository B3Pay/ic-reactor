import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { CandidDisplayReactor } from "../../src/display-reactor.js"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { CandidReactor } from "../../src/reactor.js"
import type { DynamicMethodOptions } from "../../src/types.js"
import { normalizeCandidInterface } from "../../src/utils.js"

/**
 * registerMethod also takes a whole service definition. The reactors told one
 * from a signature by the text "service :", so any other spacing, a named
 * service or a line break before the colon was wrapped in a second service
 * and failed to parse.
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

const DEFINITIONS = [
  "service: { greet : (text) -> (text) query }",
  "service :{ greet : (text) -> (text) query }",
  "service\n  : { greet : (text) -> (text) query }",
  "service greeter : { greet : (text) -> (text) query }",
  "type Name = text;\nservice: { greet : (Name) -> (text) query }",
  "service: (text) -> { greet : (text) -> (text) query }",
  "// the whole service\nservice: { greet : (text) -> (text) query; }",
]

type Config = { name: string; canisterId: string; clientManager: ClientManager }

interface Registering {
  registerMethod(options: DynamicMethodOptions): Promise<void>
  getMethodNames(): string[]
}

const reactors: Array<[string, (config: Config) => Registering]> = [
  ["CandidReactor", (config) => new CandidReactor(config)],
  ["CandidDisplayReactor", (config) => new CandidDisplayReactor(config)],
  ["MetadataReactor", (config) => new MetadataReactor(config)],
  ["MetadataDisplayReactor", (config) => new MetadataDisplayReactor(config)],
]

describe.each(reactors)("%s.registerMethod", (_name, create) => {
  it.each(DEFINITIONS)("registers greet from %j", async (candid) => {
    const reactor = create({
      name: "greeter",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
    })

    await reactor.registerMethod({ functionName: "greet", candid })

    expect(reactor.getMethodNames()).toEqual(["greet"])
  })
})

describe("normalizeCandidInterface", () => {
  it("returns a service definition as it is", () => {
    for (const candid of DEFINITIONS) {
      expect(normalizeCandidInterface(candid, "greet")).toBe(candid)
    }
  })

  it("still wraps a signature that mentions service elsewhere", () => {
    expect(
      normalizeCandidInterface(
        '(record { "service" : principal; "a service: b" : nat }) -> ()',
        "m"
      )
    ).toBe(
      'service : { "m": (record { "service" : principal; "a service: b" : nat }) -> (); }'
    )
    expect(
      normalizeCandidInterface("(service { f : () -> () }) -> ()", "m")
    ).toBe('service : { "m": (service { f : () -> () }) -> (); }')
  })
})
