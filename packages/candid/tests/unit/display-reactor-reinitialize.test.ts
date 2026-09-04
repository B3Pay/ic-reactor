import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { CandidDisplayReactor } from "../../src/display-reactor.js"

/**
 * A display codec is a snapshot of one method signature, built when the codec
 * map is (re)initialised. `initialize()` replaces the whole service, so every
 * codec has to be rebuilt with it; skipping the ones that already existed left
 * a method that changed shape transforming against the old signature while
 * `getServiceInterface()` reported the new one.
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

const V1 = `service : { balance : () -> (nat) query; }`
const V2 = `service : { balance : () -> (record { amount : nat }) query; }`
const V2_RESULT = IDL.Record({ amount: IDL.Nat })

const replyWith = (reactor: object, type: IDL.Type, value: unknown) =>
  vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([type], [value]))

const codecsOf = (reactor: object) =>
  (reactor as any).codecs as Map<string, { args: unknown; result: unknown }>

describe("CandidDisplayReactor rebuilds codecs when the service is replaced", () => {
  it("transforms with the new signature after a second initialize()", async () => {
    // A canister upgraded between two calls: balance() now returns a record.
    const reactor = new CandidDisplayReactor({
      name: "ledger",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: V1,
    })
    await reactor.initialize()
    const before = codecsOf(reactor).get("balance")

    ;(reactor as any).candidSource = V2
    await reactor.initialize()
    replyWith(reactor, V2_RESULT, { amount: 5n })

    expect(codecsOf(reactor).get("balance")).not.toBe(before)
    await expect(
      reactor.callMethod({ functionName: "balance" as never })
    ).resolves.toEqual({ amount: "5" })
  })

  it("replaces a codec built from funcClass once the real interface arrives", async () => {
    // Usable immediately from a func-record guess, then corrected by the
    // fetched interface, which disagrees.
    const reactor = new CandidDisplayReactor({
      name: "ledger",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      funcClass: {
        methodName: "balance",
        func: IDL.Func([], [IDL.Nat], ["query"]),
      },
      candid: V2,
    })
    await reactor.initialize()
    replyWith(reactor, V2_RESULT, { amount: 5n })

    await expect(
      reactor.callMethod({ functionName: "balance" as never })
    ).resolves.toEqual({ amount: "5" })
  })

  it("keeps existing codecs when registerMethod adds one", async () => {
    // Guards against over-reach: the additive path stays additive.
    const reactor = new CandidDisplayReactor({
      name: "ledger",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: V1,
    })
    await reactor.initialize()
    const before = codecsOf(reactor).get("balance")

    await reactor.registerMethod({
      functionName: "name",
      candid: "() -> (text) query",
    })

    expect(codecsOf(reactor).get("balance")).toBe(before)
    expect(codecsOf(reactor).has("name")).toBe(true)
  })
})
