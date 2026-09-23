import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * buildForValueType wraps the type in a one-line service,
 * `service : { __value : (<type>) -> (); }`. A type whose last line ends in a
 * `//` comment, as one copied out of a .did file often does, commented out
 * the `) -> (); }` after it, so the Candid did not parse and the call threw.
 * registerMethod had the same trap, and drops comments first since #431.
 */

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
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

async function reactorWithoutNetwork() {
  const reactor = new MetadataReactor({
    name: "values",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid: "service : { greet : (text) -> (text) query }",
  })
  await reactor.initialize()
  // The adapter falls back to the didjs canister for Candid the local parser
  // rejects, and didjs answers invalid Candid with none.
  vi.spyOn(reactor.adapter, "compileRemote").mockResolvedValue(undefined)
  return reactor
}

describe("MetadataReactor.buildForValueType with comments", () => {
  it("reads a type followed by a line comment", async () => {
    const reactor = await reactorWithoutNetwork()

    const built = await reactor.buildForValueType("nat // amount in e8s")

    expect(built.meta.args[0].type).toBe("number")
    expect(built.meta.args[0].candidType).toBe("nat")
  })

  it("reads a record whose last line holds a comment", async () => {
    const reactor = await reactorWithoutNetwork()

    const built = await reactor.buildForValueType(`record {
  owner : principal; // the account owner
  subaccount : opt blob;
} // an ICRC-1 Account`)

    const account = built.meta.args[0]
    if (account.type !== "record") throw new Error("expected a record")
    expect(account.fields.map((field) => field.label)).toEqual([
      "owner",
      "subaccount",
    ])
  })

  it("hydrates a value of a commented type", async () => {
    const reactor = await reactorWithoutNetwork()
    const candidArgsHex = uint8ArrayToHex(
      new Uint8Array(IDL.encode([IDL.Nat], [5n]))
    )

    const built = await reactor.buildForValueType("nat // e8s", {
      candidArgsHex,
    })

    expect(built.hydration).toEqual({ status: "hydrated", values: ["5"] })
  })
})
