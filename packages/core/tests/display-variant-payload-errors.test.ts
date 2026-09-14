import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"
import { CallError } from "../src/errors/index.js"

/**
 * The variant display codec wrapped its encoder in a try/catch that returned
 * the untransformed display value when a payload's codec threw. Every check a
 * payload codec makes was therefore skipped inside a variant, and IDL.encode
 * decided alone.
 *
 * For floats IDL.encode accepts what the codec refuses. The float codec
 * rejects NaN and the infinities, and a float32 value that only overflows when
 * narrowed (3.4028236e38 becomes Infinity), so it does not send a value the
 * caller never wrote. Inside a variant those values went out anyway. For other
 * payloads the call still failed, but with IDL.encode's generic "Invalid
 * variant" message in place of the codec's error naming the problem, which is
 * the error transformArgsWithCodec exists to surface.
 */

type SetLimit = { Limit: number } | { Market: null }
type Place = { Order: { price: number; note: string } } | { Cancel: null }

interface TestActor {
  set_limit: ActorMethod<[SetLimit], undefined>
  place: ActorMethod<[Place], undefined>
}

const SetLimitType = IDL.Variant({ Limit: IDL.Float32, Market: IDL.Null })
const PlaceType = IDL.Variant({
  Order: IDL.Record({ price: IDL.Float64, note: IDL.Text }),
  Cancel: IDL.Null,
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    set_limit: IDL.Func([SetLimitType], [], []),
    place: IDL.Func([PlaceType], [], []),
  })

/** `Reactor.executeCall` is protected, so its signature is restated here. */
type ExecuteCall = (methodName: string, arg: Uint8Array) => Promise<Uint8Array>

/** A DisplayReactor whose update calls are stubbed and recorded as decoded. */
const makeDisplay = (argType: IDL.Type) => {
  const reactor = new DisplayReactor<TestActor>({
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
    name: "exchange",
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
  })
  const sent: unknown[] = []
  vi.spyOn(
    reactor as unknown as { executeCall: ExecuteCall },
    "executeCall"
  ).mockImplementation(async (_method, arg) => {
    sent.push(IDL.decode([argType], arg)[0])
    return IDL.encode([], [])
  })
  return { reactor, sent }
}

/** The prefix transformArgsWithCodec puts on a payload codec's error. */
const ARGUMENT_CONVERSION = /Could not convert the argument/

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e
  )

describe("DisplayReactor with an invalid variant payload", () => {
  it("does not send an overflowing float32 payload as Infinity", async () => {
    const { reactor, sent } = makeDisplay(SetLimitType)

    const error = await failure(
      reactor.callMethod({
        functionName: "set_limit",
        args: [{ Limit: 3.4028236e38 }] as never,
      })
    )

    expect(sent).toEqual([])
    expect(error).toBeInstanceOf(CallError)
    expect((error as Error).message).toMatch(/finite float32/)
  })

  it("does not send a NaN nested in a variant's record payload", async () => {
    const { reactor, sent } = makeDisplay(PlaceType)

    const error = await failure(
      reactor.callMethod({
        functionName: "place",
        args: [{ Order: { price: NaN, note: "limit" } }] as never,
      })
    )

    expect(sent).toEqual([])
    expect(error).toBeInstanceOf(CallError)
    expect((error as Error).message).toMatch(ARGUMENT_CONVERSION)
  })

  it("reports the payload's own error for the _type form too", async () => {
    const { reactor, sent } = makeDisplay(SetLimitType)

    const error = await failure(
      reactor.callMethod({
        functionName: "set_limit",
        args: [{ _type: "Limit", Limit: Infinity }] as never,
      })
    )

    expect(sent).toEqual([])
    // The codec's error, wrapped by transformArgsWithCodec, not IDL.encode's.
    expect((error as Error).message).toMatch(ARGUMENT_CONVERSION)
    expect((error as Error).message).not.toMatch(/Invalid variant/)
  })

  it("still encodes valid payloads in both forms", async () => {
    // Guards against over-reach.
    const { reactor, sent } = makeDisplay(PlaceType)

    await reactor.callMethod({
      functionName: "place",
      args: [{ Order: { price: "12.5", note: "limit" } }] as never,
    })
    await reactor.callMethod({
      functionName: "place",
      args: [{ _type: "Cancel" }] as never,
    })

    expect(sent).toEqual([
      { Order: { price: 12.5, note: "limit" } },
      { Cancel: null },
    ])
  })
})

describe("variant display codec", () => {
  it("lets a payload codec's error through", () => {
    const codec = didToDisplayCodec(IDL.Variant({ Data: IDL.Vec(IDL.Nat8) }))

    expect(() => codec.asCandid({ Data: "zz" } as never)).toThrow(/invalid hex/)
  })
})
