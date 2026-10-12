import { principal } from "@candid-core/schema"
import { decodeArgs } from "@candid-core/schema/codec"
import { createTestClient } from "@ic-reactor/core/testing"
import { act, renderHook } from "@testing-library/react"
import { defaultParseSearch } from "@tanstack/react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fromHex, toHex } from "../lib/hex.ts"
import {
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  addHistoryEntry,
  clearHistory,
  parseHistory,
  useCallHistory,
  type HistoryEntry,
} from "./history.ts"
import { prepareCall } from "./prepare.ts"
import { HISTORY_ARGS_MAX_BYTES, historyEntryOf } from "./record.ts"
import { SHARED_ARGS_MAX_HEX, sharedCallUrl } from "./share.ts"
import { canisterOf } from "./useCanisterHandle.ts"
import {
  CKBTC_LEDGER,
  SEED_1,
  methodOf,
  transferArg,
  typedInterface,
} from "./testing/fixtures.ts"

const iface = typedInterface(CKBTC_LEDGER)
const transfer = methodOf(iface, "icrc1_transfer")
const balanceOf = methodOf(iface, "icrc1_balance_of")

function entry(
  id: string,
  overrides: Partial<HistoryEntry> = {}
): HistoryEntry {
  return {
    id,
    at: 1_760_000_000_000,
    canisterId: CKBTC_LEDGER,
    canisterName: "ckBTC ledger",
    method: "icrc1_balance_of",
    mode: "query",
    caller: SEED_1,
    argsHex: "4449444c0000",
    outcome: "ok",
    summary: "ok: 1",
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  clearHistory()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("history", () => {
  it("stores a call's arguments as the hex of its encoded bytes, never JSON", () => {
    const call = prepareCall(transfer, [transferArg(principal("aaaaa-aa"), 5n)])
    if (call === undefined) throw new Error("transfer does not encode")
    const made = historyEntryOf(
      {
        iface,
        method: transfer,
        caller: SEED_1,
        bytes: call.bytes,
        result: { ok: true, reply: 12n },
      },
      1_760_000_000_000,
      "a"
    )
    addHistoryEntry(made)
    const stored = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0]?.argsHex).toBe(toHex(call.bytes))
    expect(stored[0]?.argsHex.startsWith("4449444c")).toBe(true)
    expect(fromHex(stored[0]?.argsHex ?? "")).toEqual(call.bytes)
    expect(stored[0]).toMatchObject({
      outcome: "ok",
      summary: "ok: 12",
      mode: "update",
    })
  })

  it("records a failure's kind and whether it may have executed", async () => {
    const test = createTestClient({ network: "ic", signedIn: false })
    const call = prepareCall(transfer, [transferArg(principal("aaaaa-aa"), 5n)])
    if (call === undefined) throw new Error("transfer does not encode")
    let error: unknown
    try {
      await test.client
        .mutationOptions(canisterOf(test.client, iface), "icrc1_transfer")
        .mutationFn(call.vars)
    } catch (caught) {
      error = caught
    }
    test.client.dispose()
    const made = historyEntryOf(
      {
        iface,
        method: transfer,
        caller: "2vxsx-fae",
        bytes: call.bytes,
        result: { ok: false, error },
      },
      1,
      "b"
    )
    expect(made).toMatchObject({
      outcome: "error",
      kind: "unauthenticated",
      mayHaveExecuted: false,
      summary: "unauthenticated/anonymous_write",
    })
  })

  it("keeps no arguments past the size cap", () => {
    const made = historyEntryOf(
      {
        iface,
        method: transfer,
        caller: SEED_1,
        bytes: new Uint8Array(HISTORY_ARGS_MAX_BYTES + 1),
        result: { ok: true, reply: 1n },
      },
      1,
      "c"
    )
    expect(made.argsHex).toBe("")
    expect(made.summary).toContain("too large")
  })

  it("drops entries that are not entries, and keeps the newest", () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        entry("ok"),
        { ...entry("bad-hex"), argsHex: "zz" },
        { id: 1 },
        "x",
      ])
    )
    expect(
      parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY)).map((e) => e.id)
    ).toEqual(["ok"])
    expect(parseHistory("not json")).toEqual([])
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) addHistoryEntry(entry(`e${i}`))
    const kept = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
    expect(kept).toHaveLength(HISTORY_LIMIT)
    expect(kept[0]?.id).toBe(`e${HISTORY_LIMIT + 4}`)
  })

  it("serves the hook's entries, and keeps working in memory when storage throws", () => {
    const { result } = renderHook(() => useCallHistory())
    expect(result.current.entries).toEqual([])
    act(() => result.current.add(entry("one")))
    expect(result.current.entries.map((e) => e.id)).toEqual(["one"])

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    act(() => result.current.add(entry("two")))
    expect(result.current.entries.map((e) => e.id)).toEqual(["two", "one"])
    act(() => result.current.clear())
    expect(result.current.entries).toEqual([])
  })
})

describe("history shared by tabs", () => {
  // A fresh module per test: an earlier test leaves this one's copy in its
  // storage-failed mode.
  const fresh = async () => {
    vi.resetModules()
    return import("./history.ts")
  }

  it("puts back an entry of this tab that another tab's stale write dropped", async () => {
    const { addHistoryEntry } = await fresh()
    addHistoryEntry(entry("mine", { at: 2, mayHaveExecuted: true }))
    // Another tab read the store before "mine" landed and wrote its own.
    const theirs = JSON.stringify([entry("theirs", { at: 3 })])
    localStorage.setItem(HISTORY_STORAGE_KEY, theirs)
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: HISTORY_STORAGE_KEY,
        newValue: theirs,
      })
    )
    const ids = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY)).map(
      (e) => e.id
    )
    expect(ids).toEqual(["theirs", "mine"])
  })

  it("does not bring entries back after another tab cleared the history", async () => {
    const { addHistoryEntry } = await fresh()
    addHistoryEntry(entry("mine"))
    localStorage.setItem(HISTORY_STORAGE_KEY, "[]")
    window.dispatchEvent(
      new StorageEvent("storage", { key: HISTORY_STORAGE_KEY, newValue: "[]" })
    )
    expect(parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))).toEqual([])
  })
})

describe("shared call links", () => {
  const account = { owner: principal(SEED_1), subaccount: null }
  const call = prepareCall(balanceOf, [account])
  if (call === undefined) throw new Error("account does not encode")

  it("writes the search as the router reads it back: run a boolean, args the exact bytes", () => {
    const url = sharedCallUrl(
      CKBTC_LEDGER,
      "icrc1_balance_of",
      call.bytes,
      true
    )
    expect(url).toBe(
      `/canister/${CKBTC_LEDGER}?method=icrc1_balance_of&args=${toHex(call.bytes)}&run=true`
    )
    const search: Record<string, unknown> = defaultParseSearch(
      new URL(url, "http://localhost").search
    )
    expect(search).toEqual({
      method: "icrc1_balance_of",
      args: toHex(call.bytes),
      run: true,
    })
    const decoded = decodeArgs(
      balanceOf.args,
      fromHex(String(search.args)) ?? new Uint8Array()
    )
    expect(decoded.ok && decoded.values).toEqual([account])
    expect(
      sharedCallUrl(CKBTC_LEDGER, "icrc1_balance_of", call.bytes, false, {
        certified: true,
      })
    ).toBe(
      `/canister/${CKBTC_LEDGER}?method=icrc1_balance_of&args=${toHex(call.bytes)}&certified=true`
    )
  })

  it("quotes a method name the router would read as JSON", () => {
    const url = sharedCallUrl(CKBTC_LEDGER, "123", call.bytes, false)
    const search: Record<string, unknown> = defaultParseSearch(
      new URL(url, "http://localhost").search
    )
    expect(search.method).toBe("123")
  })

  it("leaves arguments too large for a URL (or unknown) out, and does not run", () => {
    const big = new Uint8Array(SHARED_ARGS_MAX_HEX / 2 + 1)
    expect(sharedCallUrl(CKBTC_LEDGER, "icrc1_balance_of", big, true)).toBe(
      `/canister/${CKBTC_LEDGER}?method=icrc1_balance_of`
    )
    expect(
      sharedCallUrl(CKBTC_LEDGER, "icrc1_balance_of", new Uint8Array(), true)
    ).toBe(`/canister/${CKBTC_LEDGER}?method=icrc1_balance_of`)
  })
})
