import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * An `opt` argument accepts both the display value and the Candid wrapper
 * `[value]`, so a one-element array is ambiguous: it is either the wrapper or
 * a one-element value. The codec settled it by checking only that the single
 * element was an array (for a vector element) or not at all (for a tuple).
 *
 * That is wrong whenever the element type's own values are arrays of arrays.
 * `opt vec record { principal; nat }` holding one pair displays as
 * `[["aaaaa-aa", "100"]]`; the codec took the outer array for the wrapper,
 * encoded `["aaaaa-aa", "100"]` as the vector, and IDL.encode rejected the
 * call. The same happened to `opt vec vec T`, `opt vec func`, an `opt` of a
 * one-element tuple, and — the other way round — a text-keyed map given in
 * wrapper form. Every such value the codec had just decoded failed to encode
 * back, but only when the vector held exactly one element.
 */

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

const OWNER = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})

/** Encode, decode, display, and send the display value back. */
const roundTrip = (type: IDL.Type, value: unknown) => {
  const bytes = IDL.encode([type], [value])
  const codec = didToDisplayCodec(type)
  const display = codec.asDisplay(IDL.decode([type], bytes)[0] as never)
  const back = codec.asCandid(display as never)
  return {
    display,
    original: hex(bytes),
    returned: hex(IDL.encode([type], [back])),
  }
}

// Each fixture is `Some` of a value whose outermost array has one element.
const ONE_ELEMENT_CASES: Array<[string, IDL.Type, unknown]> = [
  [
    "opt vec record { nat; nat }",
    IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Nat))),
    [[[1n, 2n]]],
  ],
  [
    "opt vec record { principal; nat }",
    IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))),
    [[[OWNER, 100n]]],
  ],
  [
    // The cycles ledger's InitArgs.initial_balances
    "opt vec record { Account; nat }",
    IDL.Opt(IDL.Vec(IDL.Tuple(Account, IDL.Nat))),
    [[[{ owner: OWNER, subaccount: [] }, 100n]]],
  ],
  ["opt vec vec text", IDL.Opt(IDL.Vec(IDL.Vec(IDL.Text))), [[["a", "b"]]]],
  [
    "opt vec vec nat32",
    IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat32))),
    [[Uint32Array.from([7, 8])]],
  ],
  [
    "opt vec func",
    IDL.Opt(IDL.Vec(IDL.Func([], [IDL.Nat], ["query"]))),
    [[[OWNER, "get"]]],
  ],
  ["opt record { nat }", IDL.Opt(IDL.Tuple(IDL.Nat)), [[5n]]],
  ["opt record { text }", IDL.Opt(IDL.Tuple(IDL.Text)), [["x"]]],
  [
    "opt record { vec text }",
    IDL.Opt(IDL.Tuple(IDL.Vec(IDL.Text))),
    [[["x", "y"]]],
  ],
  ["opt record { opt nat }", IDL.Opt(IDL.Tuple(IDL.Opt(IDL.Nat))), [[[]]]],
]

describe("display codec — opt of an element whose values are arrays", () => {
  describe("a decoded one-element value encodes back to the same bytes", () => {
    it.each(ONE_ELEMENT_CASES)("%s", (_name, type, value) => {
      const { original, returned } = roundTrip(type, value)
      expect(returned).toBe(original)
    })
  })

  describe("the Candid wrapper form still reads as the wrapper", () => {
    it.each(ONE_ELEMENT_CASES)(
      "%s given as [display]",
      (_name, type, value) => {
        const codec = didToDisplayCodec(type)
        const bytes = IDL.encode([type], [value])
        const display = codec.asDisplay(IDL.decode([type], bytes)[0] as never)

        const back = codec.asCandid([display] as never)

        expect(hex(IDL.encode([type], [back]))).toBe(hex(bytes))
      }
    )
  })

  it("reads a text-keyed map given in wrapper form as the wrapper", () => {
    // `opt vec record { text; nat }` displays as an object, so `[{ … }]` can
    // only be the wrapper. It used to be encoded as a one-entry vector whose
    // entry was the whole object.
    const type = IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)))
    const codec = didToDisplayCodec(type)

    expect(codec.asCandid([{ "icrc1:fee": "10" }] as never)).toEqual([
      [["icrc1:fee", 10n]],
    ])
    // Bare, as before.
    expect(codec.asCandid({ "icrc1:fee": "10" } as never)).toEqual([
      [["icrc1:fee", 10n]],
    ])
  })

  it("reads a typed-array vector in wrapper form as the wrapper", () => {
    // `[Uint32Array]` is how IDL.decode returns `opt vec nat32`, and what the
    // generated `[] | [Uint32Array | number[]]` type allows. The typed array
    // failed the old `Array.isArray` test, so it was taken for the value and
    // each "element" — the whole typed array — was rejected.
    const nat32s = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Nat32)))
    const words = Uint32Array.from([1, 2])
    expect(nat32s.asCandid([words] as never)).toEqual([words])

    const nat64s = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Nat64)))
    const bigs = BigUint64Array.from([1n, 2n ** 64n - 1n])
    expect(nat64s.asCandid([bigs] as never)).toEqual([bigs])
  })

  describe("a typed array is a vector only of numbers of its width", () => {
    // IDL.encode takes a typed array as a vector only when the elements are
    // numbers of the array's width, so a `Uint8Array` is one blob and never a
    // `vec blob`. Any typed array used to count as a possible value of any
    // vector: `[bytes]` for `opt vec blob`, a one-element vector holding one
    // blob, was read as the wrapper around a `vec blob`, and IDL.encode then
    // took each byte for a blob and rejected the call.
    const bytes = Uint8Array.of(1, 2)
    const words = Uint32Array.of(7, 8)

    const BARE_VALUES: Array<[string, IDL.Type, unknown, unknown]> = [
      [
        "opt vec blob given [bytes]",
        IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat8))),
        [bytes],
        [[bytes]],
      ],
      [
        "opt vec vec nat32 given [Uint32Array]",
        IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat32))),
        [words],
        [[words]],
      ],
      [
        // The same question, asked of a tuple's component.
        "opt record { vec blob } given [[bytes]]",
        IDL.Opt(IDL.Tuple(IDL.Vec(IDL.Vec(IDL.Nat8)))),
        [[bytes]],
        [[[bytes]]],
      ],
    ]

    it.each(BARE_VALUES)(
      "%s reads the array as the value",
      (_name, type, given, candid) => {
        const sent = didToDisplayCodec(type).asCandid(given as never)

        expect(sent).toEqual(candid)
        expect(hex(IDL.encode([type], [sent]))).toBe(
          hex(IDL.encode([type], [candid]))
        )
      }
    )

    it("still reads the wrapper around a blob or a vector of its width", () => {
      const optBlob = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Nat8)))
      expect(optBlob.asCandid([bytes] as never)).toEqual([bytes])

      const int16s = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Int16)))
      const halves = Int16Array.of(-1, 1)
      expect(int16s.asCandid([halves] as never)).toEqual([halves])

      // `opt vec blob` in wrapper form, and bare with the blob as hex text.
      const blobs = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat8))))
      expect(blobs.asCandid([[bytes]] as never)).toEqual([[bytes]])
      expect(blobs.asCandid(["0102"] as never)).toEqual([[bytes]])
    })
  })

  it("keeps [[]] as some(empty) where both readings are possible", () => {
    // `[]` is a valid `vec vec text` and a valid element list alike; the
    // wrapper reading wins, as it always has.
    const codec = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Vec(IDL.Text))))
    expect(codec.asCandid([[]] as never)).toEqual([[]])
  })

  describe("generated: vectors of every length round-trip", () => {
    // Deterministic, so a failure names the exact value.
    let seed = 0x5eed
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const count = () => 1 + Math.floor(next() * 3)

    const GENERATORS: Array<[string, IDL.Type, () => unknown]> = [
      [
        "opt vec record { principal; nat }",
        IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))),
        () => Array.from({ length: count() }, (_, i) => [OWNER, BigInt(i)]),
      ],
      [
        "opt vec record { nat64; nat64 }",
        IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Nat64, IDL.Nat64))),
        () =>
          Array.from({ length: count() }, (_, i) => [
            BigInt(i),
            2n ** 64n - 1n,
          ]),
      ],
      [
        "opt vec vec text",
        IDL.Opt(IDL.Vec(IDL.Vec(IDL.Text))),
        // Inner vectors are non-empty: `[[]]` is the one genuinely ambiguous
        // display value (see above).
        () =>
          Array.from({ length: count() }, () =>
            Array.from({ length: count() }, (_, j) => `t${j}`)
          ),
      ],
      [
        "opt vec record { text; vec nat }",
        IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat)))),
        () =>
          Array.from({ length: count() }, (_, i) => [
            `k${i}`,
            Array.from({ length: count() }, (_, j) => BigInt(j)),
          ]),
      ],
      [
        "opt record { vec record { nat; text } }",
        IDL.Opt(IDL.Tuple(IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Text)))),
        () => [Array.from({ length: count() }, (_, i) => [BigInt(i), `v${i}`])],
      ],
    ]

    for (const [name, type, generate] of GENERATORS) {
      it(name, () => {
        for (let run = 0; run < 25; run++) {
          const value = [generate()]
          const { original, returned } = roundTrip(type, value)
          expect(
            returned,
            JSON.stringify(value, (_k, v) =>
              typeof v === "bigint" ? `${v}n` : v
            )
          ).toBe(original)
        }
      })
    }
  })
})

interface LedgerActor {
  set_initial_balances: ActorMethod<
    [
      | []
      | [Array<[{ owner: Principal; subaccount: [] | [Uint8Array] }, bigint]>],
    ],
    undefined
  >
}

const Balances = IDL.Opt(IDL.Vec(IDL.Tuple(Account, IDL.Nat)))

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    set_initial_balances: IDL.Func([Balances], [], ["query"]),
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DisplayReactor — opt vec record { Account; nat } with one entry", () => {
  it("sends the single balance instead of failing to encode", async () => {
    const reactor = new DisplayReactor<LedgerActor>({
      clientManager: new ClientManager({ queryClient: new QueryClient() }),
      name: "ledger",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })
    const executeQuery = vi
      .spyOn(reactor as any, "executeQuery")
      .mockResolvedValue(IDL.encode([], []))

    await reactor.callMethod({
      functionName: "set_initial_balances",
      args: [[[{ owner: OWNER.toText() }, "100"]]],
    })

    const sent = executeQuery.mock.calls[0][1] as Uint8Array
    expect(hex(sent)).toBe(
      hex(
        IDL.encode([Balances], [[[[{ owner: OWNER, subaccount: [] }, 100n]]]])
      )
    )
  })
})
