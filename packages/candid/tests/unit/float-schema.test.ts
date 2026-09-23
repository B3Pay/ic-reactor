import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * A float field holds its value as text. The field schemas accepted text the
 * display codec then refused when the call was made: a blank value such as
 * " " (Number(" ") is 0), "Infinity" or "1e400" in FieldVisitor, and in both
 * visitors a float32 beyond its range, which IDL.encode would narrow to
 * Infinity. The form said the value was valid and the call failed.
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
  service : {
    set_price : (float64) -> ();
    set_ratio : (float32) -> ();
  }
`

async function displayReactor() {
  const reactor = new MetadataDisplayReactor({
    name: "prices",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid: CANDID,
  })
  await reactor.initialize()
  return reactor
}

async function metadataReactor() {
  const reactor = new MetadataReactor({
    name: "prices",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid: CANDID,
  })
  await reactor.initialize()
  return reactor
}

/** Whether callMethod sends `value`, the way a form submits it. */
async function sends(
  reactor: MetadataDisplayReactor,
  method: string,
  value: string
): Promise<boolean> {
  const send = vi
    .spyOn(reactor as any, "executeCall")
    .mockResolvedValue(IDL.encode([], []))
  try {
    await reactor.callMethod({ functionName: method, args: [value] })
    return true
  } catch {
    return false
  } finally {
    send.mockRestore()
  }
}

describe("float field schemas", () => {
  it("rejects what the display codec refuses to send", async () => {
    const reactor = await displayReactor()
    const price = reactor.getInputMeta("set_price")!.args[0].schema
    const ratio = reactor.getInputMeta("set_ratio")!.args[0].schema

    for (const value of [" ", "Infinity", "-Infinity", "1e400"]) {
      expect(price.safeParse(value).success, value).toBe(false)
    }
    expect(ratio.safeParse("3.5e38").success).toBe(false)

    expect(price.safeParse(" 2.5 ").success).toBe(true)
    expect(price.safeParse("1e300").success).toBe(true)
    expect(ratio.safeParse("3.4028234663852886e38").success).toBe(true)
  })

  it("rejects a blank value and an overflowing float32 in MetadataReactor", async () => {
    const reactor = await metadataReactor()
    const price = reactor.getInputMeta("set_price")!.args[0].schema
    const ratio = reactor.getInputMeta("set_ratio")!.args[0].schema

    expect(price.safeParse(" ").success).toBe(false)
    expect(ratio.safeParse("3.5e38").success).toBe(false)
    expect(ratio.safeParse("1.5").success).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: text a person might type into a float field
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

const MANTISSAS = [
  "0",
  "1",
  "3.14",
  ".5",
  "5.",
  "340282346",
  "1.7976931348623157",
]
const EXPONENTS = ["", "e38", "e39", "e-45", "e308", "e309", "E+2"]
const SPECIAL = ["", " ", "\t", "Infinity", "-Infinity", "NaN", "0x1F", "abc"]
const PADDING = ["", " ", "  "]

describe("generated float text (seed 20260923)", () => {
  it("MetadataDisplayReactor accepts exactly what it can send", async () => {
    const reactor = await displayReactor()
    const r = rng(20260923)
    for (let i = 0; i < 150; i++) {
      const text =
        r.int(5) === 0
          ? r.pick(SPECIAL)
          : `${r.pick(PADDING)}${r.pick(["", "-"])}${r.pick(MANTISSAS)}${r.pick(EXPONENTS)}${r.pick(PADDING)}`
      for (const method of ["set_price", "set_ratio"]) {
        const accepted = reactor
          .getInputMeta(method)!
          .schema.safeParse([text]).success
        expect(accepted, `${method}(${JSON.stringify(text)})`).toBe(
          await sends(reactor, method, text)
        )
      }
    }
  })
})
