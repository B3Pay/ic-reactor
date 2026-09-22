import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * `opt opt T` has three values, and canisters use all three. Internet
 * Identity's InternetIdentityInit (also the result of its `config` query) and
 * Orbit's EditNamedRuleOperationInput spell out the convention: none keeps
 * the stored value, `opt null` clears it, `opt opt x` sets it.
 *
 * The display codec decoded none to `undefined` and some(none) to the inner
 * none — also `undefined` — so a DisplayReactor result could not tell
 * "cleared" from "untouched". Some(none) now displays as `null`, the value
 * `opt null` already gives its some(null). Encoding is unchanged: `null` and
 * `undefined` both still send none, and `[null]` sends some(none).
 */

const AnalyticsConfig = IDL.Record({ url: IDL.Text })

// A list whose own type is an optional: `opt List` is `opt opt record {...}`.
const List = IDL.Rec()
List.fill(IDL.Opt(IDL.Record({ head: IDL.Nat, tail: List })))

const NESTED: Array<[string, IDL.Type, unknown]> = [
  ["opt opt nat", IDL.Opt(IDL.Opt(IDL.Nat)), 5n],
  ["opt opt text", IDL.Opt(IDL.Opt(IDL.Text)), ""],
  ["opt opt bool", IDL.Opt(IDL.Opt(IDL.Bool)), false],
  [
    "opt opt record",
    IDL.Opt(IDL.Opt(AnalyticsConfig)),
    { url: "https://a.example" },
  ],
  ["opt opt vec text", IDL.Opt(IDL.Opt(IDL.Vec(IDL.Text))), ["x"]],
  ["opt (recursive opt)", IDL.Opt(List), { head: 1n, tail: [] }],
]

describe("display codec — opt opt T", () => {
  describe("none, some(none) and some(some(x)) display differently", () => {
    it.each(NESTED)("%s", (_name, type, inner) => {
      const codec = didToDisplayCodec(type)
      const values = [[], [[]], [[inner]]]
      const displays = values.map((value) =>
        codec.asDisplay(
          IDL.decode([type], IDL.encode([type], [value]))[0] as never
        )
      )

      expect(displays[0]).toBeUndefined()
      expect(displays[1]).toBeNull()
      expect(displays[2]).not.toBeNull()
      expect(displays[2]).not.toBeUndefined()

      // Distinct after JSON too, where a field holding undefined disappears.
      const asJson = displays.map((display) => JSON.stringify({ f: display }))
      expect(new Set(asJson).size).toBe(3)
    })
  })

  it("leaves a single opt alone", () => {
    const codec = didToDisplayCodec(IDL.Opt(IDL.Nat))
    expect(codec.asDisplay([])).toBeUndefined()
    expect(codec.asDisplay([7n])).toBe("7")

    // `opt null`'s some(null) was already null, and none undefined.
    const optNull = didToDisplayCodec(IDL.Opt(IDL.Null))
    expect(optNull.asDisplay([null])).toBeNull()
    expect(optNull.asDisplay([])).toBeUndefined()
  })

  it("encodes exactly as before", () => {
    const codec = didToDisplayCodec(IDL.Opt(IDL.Opt(IDL.Nat)))

    // Nullish still means none — never "clear" — so an untouched field keeps
    // meaning "keep the stored value".
    expect(codec.asCandid(null)).toEqual([])
    expect(codec.asCandid(undefined)).toEqual([])
    // Some(none) is written in the Candid wrapper form.
    expect(codec.asCandid([null] as never)).toEqual([[]])
    expect(codec.asCandid([[]] as never)).toEqual([[]])
    expect(codec.asCandid("5")).toEqual([[5n]])
  })
})

interface InternetIdentity {
  config: ActorMethod<
    [],
    {
      analytics_config: [] | [[] | [{ url: string }]]
      mcp_official_url: [] | [[] | [string]]
      is_production: [] | [boolean]
    }
  >
}

const InternetIdentityInit = IDL.Record({
  analytics_config: IDL.Opt(IDL.Opt(AnalyticsConfig)),
  mcp_official_url: IDL.Opt(IDL.Opt(IDL.Text)),
  is_production: IDL.Opt(IDL.Bool),
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    config: IDL.Func([], [InternetIdentityInit], ["query"]),
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DisplayReactor — Internet Identity's config query", () => {
  it("tells a cleared setting from one that was never set", async () => {
    const reactor = new DisplayReactor<InternetIdentity>({
      clientManager: new ClientManager({ queryClient: new QueryClient() }),
      name: "internet_identity",
      canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      idlFactory,
    })
    const stored = {
      analytics_config: [[]], // cleared: `opt null`
      mcp_official_url: [], // untouched: `null`
      is_production: [true],
    }
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([InternetIdentityInit], [stored])
    )

    const config = await reactor.callMethod({ functionName: "config" })

    expect(config.analytics_config).toBeNull()
    expect(config.mcp_official_url).toBeUndefined()
    expect(config.is_production).toBe(true)
    expect(JSON.parse(JSON.stringify(config))).toEqual({
      analytics_config: null,
      is_production: true,
    })
  })
})
