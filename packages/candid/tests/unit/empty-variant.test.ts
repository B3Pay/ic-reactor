import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * `variant {}` is valid Candid with no values. Rust's `enum Never {}` derives
 * it, and a service can use it as the error of an operation that cannot fail.
 * One occurrence anywhere in a service's argument types made initialize()
 * throw for both metadata reactors, so none of the service's methods got
 * metadata (#437).
 */

const CANDID = `
  type Never = variant {};
  service : {
    greet : (text) -> (text) query;
    settle : (variant { Ok : nat; Err : Never }) -> ();
    close : (record { reason : Never }) -> ();
    forbid : (Never) -> ();
  }
`

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

const reactors = [
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const

describe.each(reactors)("%s with a variant {} argument", (_name, Reactor) => {
  async function initialized() {
    const reactor = new Reactor({
      name: "never",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()
    return reactor
  }

  it("initializes and describes the other methods", async () => {
    const reactor = await initialized()

    expect(reactor.getInputMeta("greet")?.args).toHaveLength(1)
    expect(reactor.getInputMeta("settle")?.args).toHaveLength(1)
  })

  it("gives the empty variant no options and a schema that accepts nothing", async () => {
    const reactor = await initialized()
    const forbid = reactor.getInputMeta("forbid")
    const [never] = forbid?.args ?? []
    if (never?.type !== "variant") throw new Error("expected a variant field")

    expect(never.options).toEqual([])
    expect(never.defaultOption).toBe("")
    expect(never.defaultValue).toEqual({})
    // Including the made-up `null` option the form visitor used to fall back
    // to, which would not have encoded.
    for (const value of [{}, { _type: "null" }, null, { Err: null }]) {
      expect(never.schema.safeParse(value).success).toBe(false)
      expect(forbid?.schema.safeParse([value]).success).toBe(false)
    }
  })

  it("keeps the other options of a variant that holds one", async () => {
    const reactor = await initialized()
    const settle = reactor.getInputMeta("settle")
    const [outcome] = settle?.args ?? []
    if (outcome?.type !== "variant") throw new Error("expected a variant field")

    expect(outcome.options.map((option) => option.label)).toEqual(["Ok", "Err"])
    expect(outcome.defaultOption).toBe("Ok")
    expect(settle?.schema.safeParse([{ _type: "Ok", Ok: "1" }]).success).toBe(
      true
    )
    expect(settle?.schema.safeParse([{ _type: "Err", Err: {} }]).success).toBe(
      false
    )
  })

  it("keeps a record that holds one describable", async () => {
    const reactor = await initialized()
    const [record] = reactor.getInputMeta("close")?.args ?? []
    if (record?.type !== "record") throw new Error("expected a record field")

    expect(record.defaultValue).toEqual({ reason: {} })
  })
})
