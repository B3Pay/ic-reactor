import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * The form schema for a fixed-width integer checked only that the value was
 * made of digits, so a nat8 field accepted "300" and the display codec refused
 * it later, when the call was made (#439). Both form visitors now bound
 * nat8..64 and int8..64. nat and int stay unbounded.
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

const CANDID = `service : {
  f : (nat8, int8, nat16, nat64, int64, nat, int) -> ();
}`

const cases: Array<[string, number, string[], string[]]> = [
  ["nat8", 0, ["0", "255"], ["256", "300", "-1"]],
  ["int8", 1, ["-128", "127"], ["-129", "128"]],
  ["nat16", 2, ["65535"], ["65536"]],
  ["nat64", 3, ["18446744073709551615"], ["18446744073709551616"]],
  [
    "int64",
    4,
    ["-9223372036854775808", "9223372036854775807"],
    ["-9223372036854775809", "9223372036854775808"],
  ],
  ["nat", 5, ["18446744073709551616000"], ["-1"]],
  ["int", 6, ["-18446744073709551616000"], ["1.5"]],
]

const reactors = [
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const

describe.each(reactors)("%s integer field schemas", (_name, Reactor) => {
  it.each(cases)(
    "bounds %s to its range",
    async (_type, index, accepted, rejected) => {
      const reactor = new Reactor({
        name: "bounds",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: CANDID,
      })
      await reactor.initialize()
      const field = reactor.getInputMeta("f")?.args[index]
      if (!field) throw new Error("expected a field")

      for (const value of accepted) {
        expect(field.schema.safeParse(value).success).toBe(true)
      }
      for (const value of rejected) {
        expect(field.schema.safeParse(value).success).toBe(false)
      }
    }
  )
})
