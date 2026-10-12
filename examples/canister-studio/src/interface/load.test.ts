// What route loaders and pages call. The server function and the browser
// fallback are mocked: this file never reaches a network or a compiler (the
// runtime payloads below carry the committed icrc1 envelope).
import { serviceMethods } from "@candid-core/schema"
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import icrc1Did from "../../did/icrc1.did?raw"
import { actor as icpLedgerActor } from "../canisters/icp_ledger.ts"
import icrc1EnvelopeText from "../canisters/icrc1.envelope.json?raw"
import { actor as icrc1Actor } from "../canisters/icrc1.ts"
import { sha256Hex } from "../lib/hex.ts"
import { registryEntry } from "../lib/registry.ts"
import { readInterfaceInBrowser } from "./browser.ts"
import { fetchInterface } from "./functions.ts"
import {
  interfaceFromPayload,
  loadInterfacePayload,
  loadLivePayload,
  useCanisterInterface,
} from "./load.ts"
import type { CanisterInterface, InterfacePayload } from "./types.ts"

vi.mock("./functions.ts", () => ({ fetchInterface: vi.fn() }))
vi.mock("./browser.ts", () => ({ readInterfaceInBrowser: vi.fn() }))

const fetchMock = vi.mocked(fetchInterface)
const browserMock = vi.mocked(readInterfaceInBrowser)

const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const CKETH_LEDGER = "ss2fx-dyaaa-aaaar-qacoq-cai"
const CKBTC_MINTER = "mqygn-kiaaa-aaaar-qaadq-cai"
const CYCLES_LEDGER = "um5iw-rqaaa-aaaaq-qaaba-cai"
// The NNS dapp: neither in the registry nor curated.
const SOME_CANISTER = "qoctq-giaaa-aaaaa-aaaea-cai"

type OkPayload = Extract<InterfacePayload, { ok: true }>

async function runtimePayload(
  canisterId: string,
  overrides: Partial<OkPayload> = {}
): Promise<OkPayload> {
  return {
    ok: true,
    canisterId,
    source: { kind: "metadata", certified: true, moduleHash: "a1".repeat(32) },
    did: icrc1Did,
    didSha256: await sha256Hex(new TextEncoder().encode(icrc1Did)),
    envelopeJson: JSON.stringify(JSON.parse(icrc1EnvelopeText)),
    docs: { icrc1_fee: "The fee of one transfer." },
    fetchedAt: 1_000,
    cache: "miss",
    compiledIn: "server",
    ...overrides,
  }
}

function ok(p: InterfacePayload): OkPayload {
  if (!p.ok) {
    throw new Error(`expected an interface, got ${p.code}: ${p.message}`)
  }
  return p
}

beforeEach(() => {
  fetchMock.mockReset()
  browserMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("loadInterfacePayload", () => {
  it("gives a registry canister's typed payload without a server call", async () => {
    const p = ok(await loadInterfacePayload(ICP_LEDGER))
    expect(p).toMatchObject({
      canisterId: ICP_LEDGER,
      source: { kind: "typed", module: "icp_ledger" },
      did: registryEntry(ICP_LEDGER)?.did,
      fetchedAt: 0,
      cache: "typed",
    })
    expect(p.didSha256).toBe(await sha256Hex(new TextEncoder().encode(p.did)))
    expect(p.envelopeJson).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reads a typed canister's docs from its committed module", async () => {
    const p = ok(await loadInterfacePayload(CKBTC_MINTER))
    expect(p.docs.get_minter_info).toMatch(/Returns internal minter parameters/)
  })

  it("refuses an invalid id without a server call", async () => {
    expect(
      await loadInterfacePayload(" mxzaz-hqaaa-aaaar-qaada-cai")
    ).toMatchObject({
      ok: false,
      code: "invalid_canister_id",
    })
    expect(await loadInterfacePayload("aaaaa-aa")).toMatchObject({
      ok: false,
      code: "management_canister",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks the server function for any other canister", async () => {
    const payload = await runtimePayload(SOME_CANISTER)
    fetchMock.mockResolvedValue(payload)
    expect(await loadInterfacePayload(SOME_CANISTER)).toBe(payload)
    expect(fetchMock).toHaveBeenCalledWith({
      data: { canisterId: SOME_CANISTER },
    })
  })

  it("passes a failure the server returns through, without a browser read", async () => {
    const failure: InterfacePayload = {
      ok: false,
      canisterId: SOME_CANISTER,
      code: "no_interface",
      message: "none",
    }
    fetchMock.mockResolvedValue(failure)
    expect(await loadInterfacePayload(SOME_CANISTER)).toBe(failure)
    expect(browserMock).not.toHaveBeenCalled()
  })

  it("reads from the browser when the server function cannot be called", async () => {
    vi.stubEnv("SSR", false)
    const fromBrowser = await runtimePayload(SOME_CANISTER, {
      compiledIn: "browser",
    })
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    browserMock.mockResolvedValue(fromBrowser)
    expect(await loadInterfacePayload(SOME_CANISTER)).toBe(fromBrowser)
    expect(browserMock).toHaveBeenCalledWith(SOME_CANISTER)
  })

  it("reports a failed call during SSR instead of reading from the server's 'browser'", async () => {
    vi.stubEnv("SSR", true)
    fetchMock.mockRejectedValue(new Error("AsyncLocalStorage is gone"))
    expect(await loadInterfacePayload(SOME_CANISTER)).toMatchObject({
      ok: false,
      code: "network",
    })
    expect(browserMock).not.toHaveBeenCalled()
  })

  // StackBlitz: the server answers a plain 500, and TanStack Start's client
  // resolves the call with undefined instead of rejecting.
  it("reads from the browser when the server function resolves with no result", async () => {
    vi.stubEnv("SSR", false)
    const fromBrowser = await runtimePayload(SOME_CANISTER, {
      compiledIn: "browser",
    })
    fetchMock.mockResolvedValue(undefined as unknown as InterfacePayload)
    browserMock.mockResolvedValue(fromBrowser)
    expect(await loadInterfacePayload(SOME_CANISTER)).toBe(fromBrowser)
    expect(browserMock).toHaveBeenCalledWith(SOME_CANISTER)
  })

  it("reports a call with no result during SSR as a failed payload", async () => {
    vi.stubEnv("SSR", true)
    fetchMock.mockResolvedValue(undefined as unknown as InterfacePayload)
    expect(await loadInterfacePayload(SOME_CANISTER)).toMatchObject({
      ok: false,
      canisterId: SOME_CANISTER,
      code: "network",
      message: expect.stringMatching(/studio's server/),
    })
    expect(browserMock).not.toHaveBeenCalled()
  })
})

describe("loadLivePayload", () => {
  it("reads a registry canister live too, for a check against its committed .did", async () => {
    const payload = await runtimePayload(ICP_LEDGER)
    fetchMock.mockResolvedValue(payload)
    expect(await loadLivePayload(ICP_LEDGER)).toBe(payload)
    expect(fetchMock).toHaveBeenCalledWith({ data: { canisterId: ICP_LEDGER } })
  })

  it("falls back to the browser when the server gives no result", async () => {
    vi.stubEnv("SSR", false)
    const fromBrowser = await runtimePayload(ICP_LEDGER, {
      compiledIn: "browser",
    })
    fetchMock.mockResolvedValue({} as InterfacePayload)
    browserMock.mockResolvedValue(fromBrowser)
    expect(await loadLivePayload(ICP_LEDGER)).toBe(fromBrowser)
  })
})

describe("interfaceFromPayload", () => {
  it("uses the registry's generated actor for a typed payload", async () => {
    const p = ok(await loadInterfacePayload(ICP_LEDGER))
    const iface = interfaceFromPayload(p)
    expect(iface.actor).toBe(icpLedgerActor)
    expect(iface).toMatchObject({
      canisterId: ICP_LEDGER,
      name: "ICP ledger",
      source: p.source,
    })
    expect(iface.registry?.id).toBe(ICP_LEDGER)
    expect(iface.methods).toHaveLength(serviceMethods(icpLedgerActor).size)
    expect(iface.method("icrc1_transfer")?.mode).toBe("update")
    expect(iface.method("icrc1_balance_of")?.mode).toBe("query")
    expect(interfaceFromPayload(p)).toBe(iface)
  })

  it("sorts methods by code point and looks names up in a Map", async () => {
    const iface = interfaceFromPayload(
      ok(await loadInterfacePayload(ICP_LEDGER))
    )
    const names = iface.methods.map((m) => m.name)
    expect(names).toEqual([...names].sort())
    expect(iface.method("toString")).toBeUndefined()
    expect(iface.method("__proto__")).toBeUndefined()
  })

  it("gives ckBTC and ckETH ledgers their own interfaces over one actor", async () => {
    const ckbtc = interfaceFromPayload(
      ok(await loadInterfacePayload(CKBTC_LEDGER))
    )
    const cketh = interfaceFromPayload(
      ok(await loadInterfacePayload(CKETH_LEDGER))
    )
    expect(ckbtc).not.toBe(cketh)
    expect(ckbtc.actor).toBe(icrc1Actor)
    expect(cketh.actor).toBe(icrc1Actor)
    expect(cketh.name).toBe("ckETH ledger")
  })

  it("rebuilds a runtime interface from its envelope, with docs", async () => {
    const iface = interfaceFromPayload(await runtimePayload(SOME_CANISTER))
    expect(iface.name).toBe(SOME_CANISTER)
    expect(iface.registry).toBeUndefined()
    expect(iface.omitted).toEqual([])
    expect(iface.methods.map((m) => m.name)).toContain("icrc1_transfer")
    expect(iface.method("icrc1_fee")?.doc).toBe("The fee of one transfer.")
    expect(iface.method("icrc1_symbol")?.doc).toBeUndefined()
  })

  it("keeps objects stable by content: a payload rebuilt after hydration gives the same interface", async () => {
    const first = interfaceFromPayload(await runtimePayload(CYCLES_LEDGER))
    const again = interfaceFromPayload(await runtimePayload(CYCLES_LEDGER))
    expect(again).toBe(first)
    expect(first.name).toBe("Cycles ledger")
    // Another canister with the same .did: its own interface, the same schemas.
    const other = interfaceFromPayload(await runtimePayload(SOME_CANISTER))
    expect(other).not.toBe(first)
    expect(other.actor).toBe(first.actor)
  })

  it("labels a tmp_hack interface from the payload's source", async () => {
    const iface = interfaceFromPayload(
      await runtimePayload(SOME_CANISTER, {
        source: { kind: "tmp_hack", certified: false, moduleHash: null },
      })
    )
    expect(iface.source).toEqual({
      kind: "tmp_hack",
      certified: false,
      moduleHash: null,
    })
  })

  it("names a pasted interface", async () => {
    const iface = interfaceFromPayload(
      await runtimePayload("", { source: { kind: "pasted", certified: false } })
    )
    expect(iface.name).toBe("Pasted interface")
  })

  it("throws for an envelope the schema loader refuses", async () => {
    const tampered = await runtimePayload(SOME_CANISTER, {
      didSha256: "f".repeat(64),
      envelopeJson: JSON.stringify({
        ...JSON.parse(icrc1EnvelopeText),
        extra: 1,
      }),
    })
    expect(() => interfaceFromPayload(tampered)).toThrow(/unknown_key/)
  })
})

describe("useCanisterInterface", () => {
  it("gives undefined for a failure, and a stable interface for a payload", async () => {
    const failure: InterfacePayload = {
      ok: false,
      canisterId: SOME_CANISTER,
      code: "no_interface",
      message: "none",
    }
    const payload = await runtimePayload(SOME_CANISTER)
    const { result, rerender } = renderHook<
      CanisterInterface | undefined,
      InterfacePayload
    >((p) => useCanisterInterface(p), { initialProps: failure })
    expect(result.current).toBeUndefined()
    rerender(payload)
    const iface = result.current
    expect(iface?.canisterId).toBe(SOME_CANISTER)
    rerender({ ...payload })
    expect(result.current).toBe(iface)
  })
})
