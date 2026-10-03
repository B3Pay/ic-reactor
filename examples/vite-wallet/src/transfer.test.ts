// Scenario 5, without React: what typed text becomes, or why it is refused.
import { describe, expect, it } from "vitest"
import type { TransferError } from "./canisters/ledger.ts"
import { BOB, FEE } from "./test/test-wallet.tsx"
import { describeTransferError, readTransferForm } from "./transfer.ts"

const token = { symbol: "ICP", decimals: 8, fee: FEE }

describe("reading the transfer form", () => {
  it("makes an argument with the fee shown and a created_at_time for deduplication", () => {
    const read = readTransferForm(
      { to: ` ${BOB} `, amount: "1.5" },
      token,
      1_700_000_000_000
    )
    expect(read).toEqual({
      ok: true,
      arg: {
        to: { owner: BOB, subaccount: null },
        amount: 150_000_000n,
        fee: FEE,
        memo: null,
        from_subaccount: null,
        created_at_time: 1_700_000_000_000_000_000n,
      },
    })
  })

  it.each([
    ["not-a-principal", "1", "to", "Not a principal."],
    [
      BOB,
      "1e3",
      "amount",
      'Write plain digits with at most one "." (no exponent, grouping or sign).',
    ],
    [
      BOB,
      "1,5",
      "amount",
      'Write plain digits with at most one "." (no exponent, grouping or sign).',
    ],
    [BOB, "-1", "amount", "An amount cannot be negative."],
    [BOB, "0.000000001", "amount", "At most 8 decimals."],
    [BOB, "0", "amount", "Send more than zero."],
    [
      BOB,
      "",
      "amount",
      'Write plain digits with at most one "." (no exponent, grouping or sign).',
    ],
  ])("refuses to %s, amount %j", (to, amount, field, reason) => {
    expect(readTransferForm({ to, amount }, token)).toEqual({
      ok: false,
      field,
      reason,
    })
  })

  it("takes amounts past what a JavaScript number holds exactly", () => {
    const read = readTransferForm(
      { to: BOB, amount: "92233720368.54775807" },
      token
    )
    expect(read.ok && read.arg.amount).toBe(9_223_372_036_854_775_807n)
  })
})

describe("the ledger's refusals, worded", () => {
  const cases: [string, TransferError, string][] = [
    [
      "InsufficientFunds",
      { tag: "InsufficientFunds", value: { balance: 50_000_000n } },
      "Insufficient funds: the balance is 0.5 ICP, less than the amount plus the fee.",
    ],
    [
      "BadFee",
      { tag: "BadFee", value: { expected_fee: 20_000n } },
      "Bad fee: the ledger now charges 0.0002 ICP. Nothing moved; send again to pay that fee.",
    ],
    [
      "Duplicate",
      { tag: "Duplicate", value: { duplicate_of: 7n } },
      "Duplicate of block 7: this exact transfer went through already, and was not made twice.",
    ],
    [
      "TooOld",
      { tag: "TooOld" },
      "Too old: created_at_time is outside the ledger's deduplication window.",
    ],
    [
      "GenericError",
      { tag: "GenericError", value: { error_code: 3n, message: "paused" } },
      "Error 3: paused",
    ],
  ]
  it.each(cases)("%s", (_tag, err, sentence) => {
    expect(describeTransferError(err, token)).toBe(sentence)
  })
})
