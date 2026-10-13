import { principal } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import type { TransferArg } from "../canisters/icrc1.ts"
import { createMockLedger, LAB_FEE, labMethod } from "./mock-ledger.ts"

const ALICE = principal(
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
)
const BOB = principal(
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
)
const ctx = { caller: ALICE }

class Rejected extends Error {
  readonly code: number
  constructor(code: number) {
    super(`reject ${code}`)
    this.code = code
  }
}

const reject = (code: 1 | 2 | 3 | 4 | 5 | 6): never => {
  throw new Rejected(code)
}

const arg = (overrides: Partial<TransferArg> = {}): TransferArg => ({
  to: { owner: BOB, subaccount: null },
  amount: 1_000n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: 1_700_000_000_000_000_000n,
  ...overrides,
})

function ledger() {
  const mock = createMockLedger(reject)
  mock.fund(ALICE, 10_000n)
  const transfer = mock.handlers.icrc1_transfer
  if (transfer === undefined) throw new Error("no transfer handler")
  return { mock, transfer: (a: TransferArg) => transfer(a, ctx) }
}

describe("the mock ICRC-1 ledger", () => {
  it("moves the amount and charges the fee", async () => {
    const { mock, transfer } = ledger()
    expect(await transfer(arg())).toEqual({ tag: "Ok", value: 0n })
    expect(mock.balanceOf(ALICE)).toBe(10_000n - 1_000n - LAB_FEE)
    expect(mock.balanceOf(BOB)).toBe(1_000n)
    expect(mock.executed).toBe(1)
  })

  it("answers Duplicate to the same transfer with created_at_time, and runs it once", async () => {
    const { mock, transfer } = ledger()
    await transfer(arg())
    expect(await transfer(arg())).toEqual({
      tag: "Err",
      value: { tag: "Duplicate", value: { duplicate_of: 0n } },
    })
    expect(mock.executed).toBe(1)
  })

  it("runs two different transfers that share a timestamp, and repeats without one", async () => {
    const { mock, transfer } = ledger()
    await transfer(arg())
    await transfer(arg({ amount: 2_000n }))
    await transfer(arg({ created_at_time: null }))
    await transfer(arg({ created_at_time: null }))
    expect(mock.executed).toBe(4)
  })

  it("refuses a wrong fee and an overdraft with typed Errs", async () => {
    const { transfer } = ledger()
    expect(await transfer(arg({ fee: 1n }))).toEqual({
      tag: "Err",
      value: { tag: "BadFee", value: { expected_fee: LAB_FEE } },
    })
    expect(await transfer(arg({ amount: 10_000n }))).toEqual({
      tag: "Err",
      value: { tag: "InsufficientFunds", value: { balance: 10_000n } },
    })
  })

  it("fails only the next transfer as armed, before touching a balance", async () => {
    const { mock, transfer } = ledger()
    mock.failNextTransfer({ kind: "trap", message: "boom" })
    await expect(async () => transfer(arg())).rejects.toThrow("boom")
    mock.failNextTransfer({ kind: "reject", code: 3, message: "no" })
    await expect(async () => transfer(arg())).rejects.toBeInstanceOf(Rejected)
    expect(mock.balanceOf(ALICE)).toBe(10_000n)
    expect(await transfer(arg())).toEqual({ tag: "Ok", value: 0n })
  })

  it("describes its methods for the form and the viewers", () => {
    expect(labMethod("icrc1_transfer")?.mode).toBe("update")
    expect(labMethod("icrc1_balance_of")?.args).toHaveLength(1)
    expect(labMethod("__proto__")).toBeUndefined()
  })
})
