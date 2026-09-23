import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * `empty` is the Candid type with no values, what Rust's `candid::Empty` and
 * Motoko's `None` become. Both form visitors described it as an unknown field
 * whose schema was `z.any()`, so the form accepted any value for it and the
 * call then failed in IDL.encode. A variant could also default to an option
 * holding `empty`, the same trap #437 closed for `variant {}`.
 */

const CANDID = `
  service : {
    settle : (variant { Ok : nat; Err : empty }) -> ();
    forbid : (empty) -> ();
    pick : (variant { Never : empty; Value : nat }) -> ();
    maybe : (opt empty) -> ();
    close : (record { reason : empty; note : text }) -> ();
  }
`

function createMockClientManager(): ClientManager {
  return {
    agent: HttpAgent.createSync({ host: "https://ic0.app" }),
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const reactors = [
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const

describe.each(reactors)("%s with an empty argument", (_name, Reactor) => {
  async function initialized(candid = CANDID) {
    const reactor = new Reactor({
      name: "empty",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid,
    })
    await reactor.initialize()
    return reactor
  }

  it("gives empty a schema that accepts nothing", async () => {
    const reactor = await initialized()
    const meta = reactor.getInputMeta("forbid")!

    for (const value of [null, undefined, {}, "x", 0]) {
      expect(meta.schema.safeParse([value]).success, String(value)).toBe(false)
    }
  })

  it("defaults a variant to the first option that can hold a value", async () => {
    const reactor = await initialized()
    const meta = reactor.getInputMeta("pick")!
    const [field] = meta.args
    if (field.type !== "variant") throw new Error("expected a variant field")

    expect(field.options[0]?.label).toBe("Never")
    expect(field.defaultOption).toBe("Value")
    expect(meta.defaults).toEqual([{ _type: "Value", Value: "" }])
    expect(meta.schema.safeParse([{ _type: "Never" }]).success).toBe(false)
  })

  it("accepts only none for opt empty", async () => {
    const reactor = await initialized()
    const meta = reactor.getInputMeta("maybe")!

    expect(meta.schema.safeParse([null]).success).toBe(true)
    expect(meta.schema.safeParse(["x"]).success).toBe(false)
  })

  it("keeps the other option of a result that cannot fail", async () => {
    const reactor = await initialized()
    const meta = reactor.getInputMeta("settle")!

    expect(meta.schema.safeParse([{ _type: "Ok", Ok: "1" }]).success).toBe(true)
    expect(meta.schema.safeParse([{ _type: "Err", Err: null }]).success).toBe(
      false
    )
  })

  it("rejects every value of a record holding empty", async () => {
    const reactor = await initialized()
    const meta = reactor.getInputMeta("close")!

    expect(meta.schema.safeParse([{ reason: null, note: "x" }]).success).toBe(
      false
    )
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: empty at random places in argument types
// ════════════════════════════════════════════════════════════════════════════

function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]
  return { int, pick }
}
type Rng = ReturnType<typeof rng>

const LABELS = ["a", "b", "Never", "Value", "Ok", "Err", "x"]

function typeText(r: Rng, depth: number): string {
  if (depth === 0) return r.pick(["empty", "nat", "text", "reserved"])
  switch (r.int(4)) {
    case 0:
      return `opt ${typeText(r, depth - 1)}`
    case 1: {
      const [a, b] = [r.pick(LABELS), r.pick(LABELS)]
      return a === b
        ? `record { ${a} : ${typeText(r, depth - 1)} }`
        : `record { ${a} : ${typeText(r, depth - 1)}; ${b} : ${typeText(r, depth - 1)} }`
    }
    default: {
      const [a, b] = [r.pick(LABELS), r.pick(LABELS)]
      return a === b
        ? `variant { ${a} : ${typeText(r, depth - 1)} }`
        : `variant { ${a} : ${typeText(r, depth - 1)}; ${b} : ${typeText(r, depth - 1)} }`
    }
  }
}

/**
 * The default with each text and number filled in, and "junk" wherever the
 * field is unknown: fine for `reserved`, which takes anything, and never a
 * value of `empty`.
 */
function fill(field: any, value: any): unknown {
  switch (field.type) {
    case "record":
      return Object.fromEntries(
        field.fields.map((f: any) => [f.label, fill(f, value?.[f.label])])
      )
    case "variant": {
      const option = field.options.find((o: any) => o.label === value?._type)
      if (!option) return value
      return option.type === "null"
        ? value
        : {
            _type: value._type,
            [value._type]: fill(option, value[value._type]),
          }
    }
    case "optional":
      return value === null ? value : fill(field.innerField, value)
    case "unknown":
      return "junk"
    case "text":
    case "number":
      return value === "" ? "1" : value
    default:
      return value
  }
}

describe("generated argument types holding empty (seed 20260923)", () => {
  it("MetadataDisplayReactor accepts its filled defaults exactly when it can send them", async () => {
    const r = rng(20260923)
    for (let s = 0; s < 60; s++) {
      const candid = `service : { m : (${typeText(r, 1 + r.int(3))}) -> () }`
      const reactor = new MetadataDisplayReactor({
        name: "empty",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid,
      })
      await reactor.initialize()
      const meta = reactor.getInputMeta("m")!
      const args = meta.args.map((field, i) => fill(field, meta.defaults[i]))

      const send = vi
        .spyOn(reactor as any, "executeCall")
        .mockResolvedValue(IDL.encode([], []))
      const sent = await reactor
        .callMethod({ functionName: "m", args })
        .then(() => true)
        .catch(() => false)
      send.mockRestore()

      expect(
        meta.schema.safeParse(args).success,
        `${candid} with ${JSON.stringify(args)}`
      ).toBe(sent)
    }
  })
})
