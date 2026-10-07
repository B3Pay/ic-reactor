import { describe, expect, it } from "vitest"
import { SEED_2 } from "./sandbox.ts"
import { readTransferForm, type TransferForm } from "./transfer-form.ts"

const form = (overrides: Partial<TransferForm> = {}): TransferForm => ({
  to: SEED_2,
  amount: "1.5",
  fee: "",
  ...overrides,
})

describe("reading the transfer form", () => {
  it("makes the exact argument: base units, the ledger's fee, the memo, created_at_time in ns", () => {
    const memo = new Uint8Array(16).fill(7)
    expect(
      readTransferForm(form({ to: ` ${SEED_2} ` }), 8, 1_700_000_000_000, memo)
    ).toEqual({
      ok: true,
      arg: {
        to: { owner: SEED_2, subaccount: null },
        amount: 150_000_000n,
        fee: null,
        memo,
        from_subaccount: null,
        created_at_time: 1_700_000_000_000_000_000n,
      },
    })
  })

  it("gives each transfer its own 16-byte memo, even in the same millisecond", () => {
    const first = readTransferForm(form(), 8, 1_700_000_000_000)
    const second = readTransferForm(form(), 8, 1_700_000_000_000)
    if (!first.ok || !second.ok) throw new Error("refused")
    expect(first.arg.memo).toHaveLength(16)
    expect(second.arg.memo).toHaveLength(16)
    expect(second.arg.memo).not.toEqual(first.arg.memo)
  })

  it("keeps a typed fee, also exactly", () => {
    const read = readTransferForm(form({ amount: "0.29", fee: "0.0001" }), 8)
    expect(read.ok && [read.arg.amount, read.arg.fee]).toEqual([
      29_000_000n,
      10_000n,
    ])
  })

  it.each([
    ["to", form({ to: "not a principal" })],
    ["to", form({ to: SEED_2.toUpperCase() })],
    ["amount", form({ amount: "" })],
    ["amount", form({ amount: "1e3" })],
    ["amount", form({ amount: "1,5" })],
    ["amount", form({ amount: "-1" })],
    ["amount", form({ amount: "3.141592653" })],
    ["amount", form({ amount: "0" })],
    ["fee", form({ fee: "ten" })],
  ] as const)("refuses the %s field of %j", (field, typed) => {
    const read = readTransferForm(typed, 8)
    expect(read.ok).toBe(false)
    expect(!read.ok && read.field).toBe(field)
  })
})
