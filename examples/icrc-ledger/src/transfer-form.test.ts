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
  it("makes the exact argument: base units, the ledger's fee, created_at_time in ns", () => {
    expect(
      readTransferForm(form({ to: ` ${SEED_2} ` }), 8, 1_700_000_000_000)
    ).toEqual({
      ok: true,
      arg: {
        to: { owner: SEED_2, subaccount: null },
        amount: 150_000_000n,
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: 1_700_000_000_000_000_000n,
      },
    })
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
