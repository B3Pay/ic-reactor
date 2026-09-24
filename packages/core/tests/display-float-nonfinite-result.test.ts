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
 *
 * The encode refused the same values, so a float read from a canister could
 * not be sent back through DisplayReactor unchanged (#632). It now sends any
 * number as it is, and still refuses text that is not a finite number.
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

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

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

  it("encodes every decoded value back to the bytes it came from", () => {
    // A value read from a canister has to be a value it can be sent back as
    // (#632). The encode used to refuse NaN and the infinities with "expected
    // a finite float".
    for (const type of [IDL.Float32, IDL.Float64]) {
      const codec = didToDisplayCodec(type)
      for (const value of [NaN, Infinity, -Infinity, -0, 0, 1.5]) {
        const bytes = IDL.encode([type], [value])
        const display = codec.asDisplay(IDL.decode([type], bytes)[0] as never)
        expect(hex(IDL.encode([type], [codec.asCandid(display)]))).toBe(
          hex(bytes)
        )
      }
    }
  })

  it("still refuses text that is not a finite number", () => {
    // Text is what a form holds, and the form schemas in @ic-reactor/candid
    // refuse the same text. The codec's own message is asserted, so a schema
    // error standing in for it would fail here.
    for (const [bits, type] of [
      [32, IDL.Float32],
      [64, IDL.Float64],
    ] as const) {
      const codec = didToDisplayCodec(type)
      for (const value of ["abc", "Infinity", "-Infinity", "NaN", "1e400"]) {
        expect(() => codec.asCandid(value as never)).toThrow(
          `expected a finite float${bits}`
        )
      }
      for (const value of ["", "  "]) {
        expect(() => codec.asCandid(value as never)).toThrow(
          `expected a number`
        )
      }
    }
    // A finite double that float32 cannot hold is refused as a number too:
    // IDL.encode would narrow it to Infinity, which the caller never wrote.
    expect(() => didToDisplayCodec(IDL.Float32).asCandid(3.5e38)).toThrow(
      "expected a finite float32"
    )
  })
})

interface Rates {
  rate: [] | [number]
  x: number
}

interface RatesActor {
  get_rates: ActorMethod<[], Rates>
  set_rates: ActorMethod<[Rates], undefined>
  quote: ActorMethod<[[] | [number]], string>
}

const RatesType = IDL.Record({ rate: IDL.Opt(IDL.Float64), x: IDL.Float32 })

const ratesFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_rates: IDL.Func([], [RatesType], ["query"]),
    set_rates: IDL.Func([RatesType], [], []),
    quote: IDL.Func([IDL.Opt(IDL.Float64)], [IDL.Text], ["query"]),
  })

const makeRates = () =>
  new DisplayReactor<RatesActor>({
    clientManager: new ClientManager({
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    }),
    name: "rates",
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory: ratesFactory,
  })

/** `Reactor.executeCall` is protected, so its signature is restated here. */
type ExecuteCall = (methodName: string, arg: Uint8Array) => Promise<Uint8Array>

/** Records the hex of each update call's argument. */
const recordSent = (reactor: object) => {
  const sent: string[] = []
  vi.spyOn(
    reactor as { executeCall: ExecuteCall },
    "executeCall"
  ).mockImplementation(async (_method, arg) => {
    sent.push(hex(arg))
    return IDL.encode([], [])
  })
  return sent
}

describe("DisplayReactor sending a non-finite float back (#632)", () => {
  it.each([
    ["opt NaN", { rate: [NaN], x: 1.5 }],
    ["opt Infinity and -0", { rate: [Infinity], x: -0 }],
    ["opt -Infinity", { rate: [-Infinity], x: -Infinity }],
  ])("sends %s read from a canister as the same bytes", async (_, value) => {
    const reactor = makeRates()
    const bytes = IDL.encode([RatesType], [value])
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(bytes)
    const sent = recordSent(reactor)

    const rates = await reactor.callMethod({ functionName: "get_rates" })
    await reactor.callMethod({ functionName: "set_rates", args: [rates] })

    expect(sent).toEqual([hex(bytes)])
  })

  it("gets a query key of its own for each value JSON cannot write", async () => {
    // JSON writes NaN and the infinities as null, and -0 as 0. Each one sends
    // other bytes, so each needs a key of its own, apart from none and 0.
    const reactor = makeRates()
    const asked: string[] = []
    vi.spyOn(reactor as any, "executeQuery").mockImplementation((async (
      _method: string,
      arg: Uint8Array
    ) => {
      asked.push(hex(arg))
      return IDL.encode([IDL.Text], [`quote ${asked.length}`])
    }) as never)

    const forms = [NaN, Infinity, -Infinity, -0, 0, undefined]
    const results: unknown[] = []
    for (const rate of forms) {
      results.push(
        await reactor.fetchQuery({
          functionName: "quote",
          args: [rate] as never,
        })
      )
    }

    expect(results).toEqual(forms.map((_, i) => `quote ${i + 1}`))
    expect(new Set(asked).size).toBe(forms.length)
  })

  it("loses NaN to none after a JSON round trip, as documented", async () => {
    // Guards the documented limit: JSON writes NaN as null, which an opt
    // sends as none, and -0 as 0. A plain Reactor's value loses them to JSON
    // too, so a value that has to survive JSON needs its floats serialised
    // apart from it.
    const reactor = makeRates()
    const read = { rate: [NaN], x: -0 }
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([RatesType], [read])
    )
    const sent = recordSent(reactor)

    const rates = await reactor.callMethod({ functionName: "get_rates" })
    const parsed = JSON.parse(JSON.stringify(rates))
    expect(parsed).toEqual({ rate: null, x: 0 })
    await reactor.callMethod({ functionName: "set_rates", args: [parsed] })

    expect(sent).toEqual([hex(IDL.encode([RatesType], [{ rate: [], x: 0 }]))])
  })
})
