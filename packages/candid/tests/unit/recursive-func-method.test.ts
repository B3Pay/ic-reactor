import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * A method typed by a recursive func alias (`type f = func (f) -> (f)`, as in
 * candid's keyword.did) is an `IDL.Rec` wrapping the func, with no
 * `argTypes`, `retTypes` or `annotations` of its own. #557 made the display
 * codecs unwrap it. The metadata visitors read it as a func, so the results
 * visitor threw from `initialize()`, and the metadata reactors were unusable
 * for every other method of the service too.
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
type callback = func (callback) -> (callback);
service : {
  a_callback : callback;
  balance : () -> (nat) query;
}
`

/** What the parser emits for CANDID. IDL.Service's types expect a func. */
function idlFactory({
  IDL,
}: {
  IDL: typeof import("@icp-sdk/core/candid").IDL
}) {
  const callback = IDL.Rec()
  callback.fill(IDL.Func([callback], [callback], []))
  return IDL.Service({
    a_callback: callback as unknown as IDL.FuncClass,
    balance: IDL.Func([], [IDL.Nat], ["query"]),
  })
}

const reactors = [
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const

describe.each(reactors)("%s with a recursive func alias", (_name, Reactor) => {
  it("initializes, with metadata for every method", async () => {
    const reactor = new Reactor({
      name: "keyword",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })

    await expect(reactor.initialize()).resolves.toBeUndefined()

    const balanceIn = reactor.getInputMeta("balance")
    expect(balanceIn?.functionType).toBe("query")
    expect(balanceIn?.argCount).toBe(0)
    const balanceOut = reactor.getOutputMeta("balance")
    expect(balanceOut?.resolve(5n as never).results[0].value).toBe("5")

    // The aliased method is described as the func it names.
    const callbackIn = reactor.getInputMeta("a_callback")
    expect(callbackIn?.functionType).toBe("update")
    expect(callbackIn?.argCount).toBe(1)
    expect(reactor.getOutputMeta("a_callback")?.returnCount).toBe(1)
  })

  it("is ready at construction from an idlFactory", () => {
    const reactor = new Reactor({
      name: "keyword",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      idlFactory,
    })

    expect(Object.keys(reactor.getAllOutputMeta() ?? {}).sort()).toEqual([
      "a_callback",
      "balance",
    ])
  })

  it("calls the other methods", async () => {
    const reactor = new Reactor({
      name: "keyword",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([IDL.Nat], [42n])
    )

    const result = await reactor.callMethod({ functionName: "balance" })

    expect(result.results[0].value).toBe("42")
  })
})

describe("MetadataReactor per-method helpers with a recursive func alias", () => {
  it("builds the aliased method's metadata and variable candidates", async () => {
    const reactor = new MetadataReactor({
      name: "keyword",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()

    const built = await reactor.buildForMethod("a_callback")
    expect(built.meta.argCount).toBe(1)
    expect(built.hydration.status).toBe("empty")

    // Its argument is a reference to a method of this same type.
    const callback = IDL.Rec()
    callback.fill(IDL.Func([callback], [callback], []))
    const canister = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
    const candidArgsHex = uint8ArrayToHex(
      new Uint8Array(IDL.encode([callback], [[canister, "a_callback"]]))
    )
    const hydrated = await reactor.buildForMethod("a_callback", {
      candidArgsHex,
    })
    expect(hydrated.hydration).toEqual({
      status: "hydrated",
      values: [[canister.toText(), "a_callback"]],
    })

    // Its result is offered: it was not, for want of return types.
    const candidates = reactor.buildMethodVariableCandidates("a_callback")
    expect(candidates[0]).toMatchObject({
      expr: "$a_callback",
      fieldType: "recursive",
    })
  })
})
