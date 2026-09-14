import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * Candid's float32 and float64 are IEEE 754 values, so NaN, Infinity and
 * -Infinity are valid results, and IDL.decode returns them as JS numbers.
 * The float display codec validated decoded values with Zod 4's z.number(),
 * which rejects all three. The throw escaped the whole result decode, and
 * transformResultWithCodec caught it, logged it, and returned the raw
 * Candid value. One non-finite float therefore cost the entire response its
 * display transform. Its nats stayed bigints and its principals stayed
 * Principal objects, under a type that promises strings. Inside a variant the
 * variant's own catch returned that variant untransformed instead.
 */

interface Stats {
  ratio: number
  total: bigint
  owner: Principal
}

interface TestActor {
  get_stats: ActorMethod<[], Stats>
  samples: ActorMethod<[], Array<number>>
  quote: ActorMethod<
    [],
    { Ok: { price: number; lots: bigint } } | { Err: string }
  >
}

const StatsType = IDL.Record({
  ratio: IDL.Float64,
  total: IDL.Nat,
  owner: IDL.Principal,
})
const QuoteType = IDL.Variant({
  Ok: IDL.Record({ price: IDL.Float64, lots: IDL.Nat }),
  Err: IDL.Text,
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_stats: IDL.Func([], [StatsType], ["query"]),
    samples: IDL.Func([], [IDL.Vec(IDL.Float32)], ["query"]),
    quote: IDL.Func([], [QuoteType], ["query"]),
  })

const OWNER = "aaaaa-aa"

const makeDisplay = () =>
  new DisplayReactor<TestActor>({
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
    name: "stats",
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
  })

const replyWith = (reactor: object, type: IDL.Type, value: unknown) =>
  vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([type], [value]))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DisplayReactor with a non-finite float in the result", () => {
  it.each([Infinity, -Infinity, NaN])(
    "still display-transforms the rest of a record holding %s",
    async (ratio) => {
      const reactor = makeDisplay()
      replyWith(reactor, StatsType, {
        ratio,
        total: 5n,
        owner: Principal.fromText(OWNER),
      })

      await expect(
        reactor.callMethod({ functionName: "get_stats" })
      ).resolves.toEqual({ ratio, total: "5", owner: OWNER })
    }
  )

  it("does not log a decode failure for a valid float", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const reactor = makeDisplay()
    replyWith(reactor, IDL.Vec(IDL.Float32), [1.5, NaN])

    await expect(
      reactor.callMethod({ functionName: "samples" })
    ).resolves.toEqual([1.5, NaN])
    expect(error).not.toHaveBeenCalled()
  })

  it("transforms a Result arm that holds a non-finite float", async () => {
    const reactor = makeDisplay()
    replyWith(reactor, QuoteType, { Ok: { price: Infinity, lots: 3n } })

    await expect(
      reactor.callMethod({ functionName: "quote" })
    ).resolves.toEqual({ price: Infinity, lots: "3" })
  })
})

describe("float display codec", () => {
  it("decodes every IEEE 754 value", () => {
    for (const type of [IDL.Float32, IDL.Float64]) {
      const codec = didToDisplayCodec(type)
      expect(codec.asDisplay(Infinity)).toBe(Infinity)
      expect(codec.asDisplay(-Infinity)).toBe(-Infinity)
      expect(codec.asDisplay(NaN)).toBeNaN()
      expect(codec.asDisplay(-0)).toBe(-0)
    }
  })

  it("still refuses non-finite input on the way to Candid", () => {
    // Guards the deliberate encode rule, which this change leaves alone.
    const codec = didToDisplayCodec(IDL.Float64)
    expect(() => codec.asCandid(Infinity)).toThrow()
    expect(() => codec.asCandid(NaN)).toThrow()
    expect(() => codec.asCandid("Infinity")).toThrow(/finite/)
  })
})
