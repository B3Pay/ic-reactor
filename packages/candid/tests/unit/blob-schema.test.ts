import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * A blob field takes hex text, a byte array or a Uint8Array. Its schema was
 * `z.union([z.string(), z.array(z.number()), z.instanceof(Uint8Array)])`, so
 * it accepted any text and any numbers, while the display codec reads text
 * only as hex (an optional 0x prefix, then hex digits) and bytes only as
 * integers from 0 to 255. "hello", "ab cd" and [256] passed the form and
 * failed the call.
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

const CANDID = `service : { put : (blob) -> () }`

async function displayReactor() {
  const reactor = new MetadataDisplayReactor({
    name: "store",
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
  value: unknown
): Promise<boolean> {
  const send = vi
    .spyOn(reactor as any, "executeCall")
    .mockResolvedValue(IDL.encode([], []))
  try {
    await reactor.callMethod({ functionName: "put", args: [value] })
    return true
  } catch {
    return false
  } finally {
    send.mockRestore()
  }
}

describe("blob field schemas", () => {
  it("rejects text that is not hex and bytes out of range", async () => {
    const reactor = await displayReactor()
    const schema = reactor.getInputMeta("put")!.args[0].schema

    for (const value of ["hello", "ab cd", "0xzz", [256], [-1], [1.5]]) {
      expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false)
    }
    for (const value of [
      "",
      "0xDEADbeef",
      "abc",
      [0, 255],
      new Uint8Array(2),
    ]) {
      expect(schema.safeParse(value).success, String(value)).toBe(true)
    }
  })

  it("rejects the same values in MetadataReactor", async () => {
    const reactor = new MetadataReactor({
      name: "store",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()
    const schema = reactor.getInputMeta("put")!.args[0].schema

    expect(schema.safeParse("hello").success).toBe(false)
    expect(schema.safeParse([256]).success).toBe(false)
    expect(schema.safeParse("0a0b").success).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: text and byte arrays a blob field might be given
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

const CHARS = [..."0123456789abcdefABCDEF", "g", "x", "z", " ", "-"]
const BYTES = [0, 1, 127, 255, 256, -1, 2.5]

describe("generated blob input (seed 20260923)", () => {
  it("MetadataDisplayReactor accepts exactly what it can send", async () => {
    const reactor = await displayReactor()
    const schema = reactor.getInputMeta("put")!.schema
    const r = rng(20260923)
    for (let i = 0; i < 150; i++) {
      const value =
        r.int(3) === 0
          ? Array.from({ length: r.int(4) }, () => r.pick(BYTES))
          : r.pick(["", "0x", "0X"]) +
            Array.from({ length: r.int(7) }, () =>
              r.int(4) === 0 ? r.pick(CHARS) : r.pick(CHARS.slice(0, 22))
            ).join("")
      expect(schema.safeParse([value]).success, JSON.stringify(value)).toBe(
        await sends(reactor, value)
      )
    }
  })
})
