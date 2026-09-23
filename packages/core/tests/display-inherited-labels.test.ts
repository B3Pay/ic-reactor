import { runInNewContext } from "node:vm"
import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"
import { getVariantKeyValue, getVariantValue } from "../src/utils/index.js"

/**
 * A display value is a plain object, and a plain object inherits every
 * Object.prototype member. Reading a Candid label as `value[label]` therefore
 * finds `Object.prototype.toString` for a record field called `toString` that
 * the caller left out, and the `Object` constructor for one called
 * `constructor`. `DisplayOf` makes every `opt` field optional, so leaving one
 * out is the normal way to send none — and for these labels the codec encoded
 * the inherited function instead: most payload codecs threw
 * "expected string, received function", and `opt reserved` silently went out
 * as Some. The same read broke a variant arm given as `{ _type: label }`, and
 * the variant helpers returned the inherited function as the arm's value.
 *
 * JSON.stringify drops the `undefined` a decoded none displays as, so a
 * decoded record with such a field could not be sent back after a JSON round
 * trip either.
 */

/** Every name a plain object inherits: constructor, toString, __proto__, ... */
const INHERITED = Object.getOwnPropertyNames(Object.prototype)

/**
 * IDL.encode itself calls `x.hasOwnProperty(k)`, and IDL.decode assigns
 * `x[key] = value`, so candid cannot carry these two labels whatever the
 * display layer does. They are still checked at the codec boundary below.
 */
const CANDID_CANNOT_CARRY = new Set(["hasOwnProperty", "__proto__"])

const OPTIONAL_PAYLOADS: Array<[string, IDL.Type]> = [
  ["opt text", IDL.Opt(IDL.Text)],
  ["opt nat", IDL.Opt(IDL.Nat)],
  ["opt nat32", IDL.Opt(IDL.Nat32)],
  ["opt float64", IDL.Opt(IDL.Float64)],
  ["opt bool", IDL.Opt(IDL.Bool)],
  ["opt principal", IDL.Opt(IDL.Principal)],
  ["opt blob", IDL.Opt(IDL.Vec(IDL.Nat8))],
  ["opt vec text", IDL.Opt(IDL.Vec(IDL.Text))],
  ["opt record", IDL.Opt(IDL.Record({ a: IDL.Nat }))],
  ["opt variant", IDL.Opt(IDL.Variant({ x: IDL.Null }))],
  ["opt reserved", IDL.Opt(IDL.Reserved)],
]

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

// Object.fromEntries creates an own property for every label, `__proto__`
// included, where an object literal would set the prototype instead.
const withOwn = (entries: Array<[string, unknown]>) =>
  Object.fromEntries(entries) as Record<string, unknown>

describe("display codec — labels named after Object.prototype members", () => {
  describe("an omitted optional record field encodes as none", () => {
    for (const label of INHERITED) {
      for (const [payloadName, payload] of OPTIONAL_PAYLOADS) {
        it(`record { ${label} : ${payloadName} }`, () => {
          const RecordType = IDL.Record(
            withOwn([
              [label, payload],
              ["other", IDL.Nat],
            ]) as never
          )
          const codec = didToDisplayCodec(RecordType)

          const candid = codec.asCandid({ other: "1" } as never) as Record<
            string,
            unknown
          >

          expect(Object.prototype.hasOwnProperty.call(candid, label)).toBe(true)
          expect(candid[label]).toEqual([])
          expect(candid.other).toBe(1n)

          if (!CANDID_CANNOT_CARRY.has(label)) {
            const expected = withOwn([
              [label, []],
              ["other", 1n],
            ])
            expect(hex(IDL.encode([RecordType], [candid]))).toBe(
              hex(IDL.encode([RecordType], [expected]))
            )
          }
        })
      }
    }
  })

  it("keeps a value the caller did give for such a field", () => {
    const RecordType = IDL.Record({
      constructor: IDL.Opt(IDL.Text),
      toString: IDL.Nat,
    })
    const codec = didToDisplayCodec(RecordType)

    expect(
      codec.asCandid({ constructor: "Vault", toString: "7" } as never)
    ).toEqual(
      withOwn([
        ["constructor", ["Vault"]],
        ["toString", 7n],
      ])
    )
  })

  it("still reads a field a class supplies through a getter", () => {
    // Only what every object inherits is ignored. A value the caller's own
    // prototype provides is data, as it always was.
    class TransferArgs {
      get memo() {
        return "rent"
      }
      get amount() {
        return "5"
      }
    }
    const codec = didToDisplayCodec(
      IDL.Record({ memo: IDL.Opt(IDL.Text), amount: IDL.Nat })
    )

    expect(codec.asCandid(new TransferArgs() as never)).toEqual({
      memo: ["rent"],
      amount: 5n,
    })
  })

  it("ignores what another realm's Object.prototype supplies", () => {
    // A value built in an iframe or a `vm` context inherits that realm's
    // `constructor` and `toString`, not this realm's, so comparing with this
    // realm's Object.prototype read them as fields the caller had given.
    const RecordType = IDL.Record({
      constructor: IDL.Opt(IDL.Text),
      toString: IDL.Opt(IDL.Nat),
      other: IDL.Nat,
    })
    const codec = didToDisplayCodec(RecordType)
    const foreign = runInNewContext('({ other: "5" })') as object

    expect(
      hex(IDL.encode([RecordType], [codec.asCandid(foreign as never)]))
    ).toBe(
      hex(
        IDL.encode(
          [RecordType],
          [
            withOwn([
              ["constructor", []],
              ["toString", []],
              ["other", 5n],
            ]),
          ]
        )
      )
    )
  })

  it("sends a decoded record back after a JSON round trip", () => {
    const RecordType = IDL.Record({
      constructor: IDL.Opt(IDL.Text),
      toString: IDL.Opt(IDL.Nat),
      valueOf: IDL.Opt(IDL.Record({ a: IDL.Nat })),
      toLocaleString: IDL.Opt(IDL.Principal),
      other: IDL.Nat,
    })
    const value = withOwn([
      ["constructor", []],
      ["toString", []],
      ["valueOf", []],
      ["toLocaleString", []],
      ["other", 5n],
    ])
    const bytes = IDL.encode([RecordType], [value])
    const codec = didToDisplayCodec(RecordType)

    const display = codec.asDisplay(IDL.decode([RecordType], bytes)[0] as never)
    const reparsed = JSON.parse(JSON.stringify(display))

    expect(hex(IDL.encode([RecordType], [codec.asCandid(reparsed)]))).toBe(
      hex(bytes)
    )
  })

  describe("a variant arm given as { _type } alone", () => {
    for (const label of INHERITED.filter((l) => !CANDID_CANNOT_CARRY.has(l))) {
      it(`variant { ${label} : opt text } encodes its none payload`, () => {
        const Variant = IDL.Variant(
          withOwn([
            [label, IDL.Opt(IDL.Text)],
            ["other", IDL.Nat],
          ]) as never
        )
        const codec = didToDisplayCodec(Variant)

        const candid = codec.asCandid({ _type: label } as never)

        expect(candid).toEqual(withOwn([[label, []]]))
        expect(() => IDL.encode([Variant], [candid])).not.toThrow()
      })
    }
  })

  describe("a decoded arm without a payload", () => {
    for (const label of INHERITED.filter((l) => !CANDID_CANNOT_CARRY.has(l))) {
      it(`variant { ${label} : reserved } decodes to { _type } alone`, () => {
        // IDL.decode gives null for reserved, so the display shape has no
        // payload key — and must not pick up the inherited member instead.
        const Variant = IDL.Variant(
          withOwn([
            [label, IDL.Reserved],
            ["other", IDL.Nat],
          ]) as never
        )
        const bytes = IDL.encode([Variant], [withOwn([[label, null]])])
        const codec = didToDisplayCodec(Variant)

        const display = codec.asDisplay(
          IDL.decode([Variant], bytes)[0] as never
        )

        expect(display).toEqual({ _type: label })
        expect(Object.keys(display as object)).toEqual(["_type"])
      })
    }
  })

  describe("variant helpers on a null arm's display shape", () => {
    for (const label of INHERITED) {
      it(`{ _type: "${label}" } has the value null`, () => {
        const display = { _type: label }

        expect(getVariantValue(display as never)).toBeNull()
        expect(getVariantKeyValue(display as never)).toEqual([label, null])
      })
    }
  })
})

interface VaultActor {
  describe_vault: ActorMethod<
    [{ constructor: [] | [string]; owner_note: [] | [string]; id: bigint }],
    string
  >
}

const DeployArgs = IDL.Record({
  constructor: IDL.Opt(IDL.Text),
  owner_note: IDL.Opt(IDL.Text),
  id: IDL.Nat,
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    describe_vault: IDL.Func([DeployArgs], [IDL.Text], ["query"]),
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DisplayReactor — an omitted optional field named constructor", () => {
  it("sends none for it, exactly like any other omitted optional field", async () => {
    const reactor = new DisplayReactor<VaultActor>({
      clientManager: new ClientManager({ queryClient: new QueryClient() }),
      name: "vault",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })
    const executeQuery = vi
      .spyOn(reactor as any, "executeQuery")
      .mockResolvedValue(IDL.encode([IDL.Text], ["ok"]))

    // Both optional fields left out — what a JSON round trip, a plain-JS
    // caller or a form that drops empty fields hands over. (A TypeScript
    // literal needs the cast: tsc resolves `constructor` through Object's
    // apparent members too.)
    const args = JSON.parse('[{ "id": "3" }]') as never

    await expect(
      reactor.callMethod({ functionName: "describe_vault", args })
    ).resolves.toBe("ok")

    const sent = executeQuery.mock.calls[0][1] as Uint8Array
    expect(hex(sent)).toBe(
      hex(
        IDL.encode(
          [DeployArgs],
          [
            withOwn([
              ["constructor", []],
              ["owner_note", []],
              ["id", 3n],
            ]),
          ]
        )
      )
    )
  })
})
