import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * buildMethodVariableCandidates stopped at every recursive type, so a method
 * whose whole result is one offered the result and nothing in it. Every
 * ICRC-3 ledger's icrc3_get_blocks returns such a type, GetBlocksResult,
 * recursive through its archive callback, and `$icrc3_get_blocks.log_length`
 * could not be mapped. A recursive type is now expanded the first time a path
 * meets it, and the walk stops where the same type comes round again.
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

const CANDID = `
  type GetBlocksArgs = record { start : nat; length : nat };
  type Value = variant {
    Nat : nat;
    Text : text;
    Array : vec Value;
    Map : vec record { text; Value };
  };
  type GetBlocksResult = record {
    log_length : nat;
    blocks : vec record { id : nat; block : Value };
    archived_blocks : vec record {
      args : vec GetBlocksArgs;
      callback : func (vec GetBlocksArgs) -> (GetBlocksResult) query;
    };
  };
  type List = opt record { head : nat; tail : List };
  service : {
    icrc3_get_blocks : (vec GetBlocksArgs) -> (GetBlocksResult) query;
    get_value : () -> (Value) query;
    get_list : () -> (List) query;
    get_pair : () -> (nat, opt record { name : text; items : List }) query;
  }
`

async function candidates(method: string) {
  const reactor = new MetadataReactor({
    name: "ledger",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid: CANDID,
  })
  await reactor.initialize()
  return reactor
    .buildMethodVariableCandidates(method)
    .map((candidate) => [candidate.expr, candidate.fieldType])
}

describe("buildMethodVariableCandidates for recursive results", () => {
  it("offers the fields of a result whose type is recursive", async () => {
    expect(await candidates("icrc3_get_blocks")).toEqual([
      ["$icrc3_get_blocks", "recursive"],
      ["$icrc3_get_blocks.log_length", "number"],
      ["$icrc3_get_blocks.blocks", "vector"],
      ["$icrc3_get_blocks.archived_blocks", "vector"],
    ])
  })

  it("offers the options of a recursive variant", async () => {
    // Options come in Candid's order, by label hash.
    expect(await candidates("get_value")).toEqual([
      ["$get_value", "recursive"],
      ["$get_value.Map", "vector"],
      ["$get_value.Nat", "number"],
      ["$get_value.Text", "text"],
      ["$get_value.Array", "vector"],
    ])
  })

  it("stops where the same recursive type comes round again", async () => {
    expect(await candidates("get_list")).toEqual([
      ["$get_list", "recursive"],
      ["$get_list.some", "record"],
      ["$get_list.some.head", "number"],
      ["$get_list.some.tail", "recursive"],
    ])
  })

  it("expands a recursive type met inside a result", async () => {
    expect(await candidates("get_pair")).toEqual([
      ["$get_pair", "tuple"],
      ["$get_pair.0", "number"],
      ["$get_pair.1", "optional"],
      ["$get_pair.1.some", "record"],
      ["$get_pair.1.some.name", "text"],
      ["$get_pair.1.some.items", "recursive"],
      ["$get_pair.1.some.items.some", "record"],
      ["$get_pair.1.some.items.some.head", "number"],
      ["$get_pair.1.some.items.some.tail", "recursive"],
    ])
  })
})
