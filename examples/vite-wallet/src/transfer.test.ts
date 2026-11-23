// Scenario 5, without React: what typed text becomes, or why it is refused,
// and what the ledger takes for a duplicate of what it becomes.
import { isReactorError } from "@ic-reactor/core"
import { afterEach, describe, expect, it } from "vitest"
import {
  actor as ledgerActor,
  type Actor as Ledger,
  type TransferArg,
  type Icrc1TransferError,
} from "./canisters/ledger.ts"
import {
  BOB,
  clearEnvCookie,
  createTestWallet,
  FEE,
  ICP,
  SEED_1,
  type TestWallet,
} from "./test/test-wallet.tsx"
import { describeTransferError, readTransferForm, stamped } from "./transfer.ts"
import { ICP_LEDGER } from "./use-canisters.ts"

const token = { symbol: "ICP", decimals: 8, fee: FEE }

let wallet: TestWallet | undefined
afterEach(() => {
  wallet?.client.dispose()
  wallet = undefined
  clearEnvCookie()
})

describe("reading the transfer form", () => {
  it("makes an argument with the fee shown and a memo, and leaves created_at_time for the send to stamp", () => {
    const memo = new Uint8Array(16).fill(7)
    const read = readTransferForm(
      { to: ` ${BOB} `, amount: "1.5" },
      token,
      memo
    )
    expect(read).toEqual({
      ok: true,
      arg: {
        to: { owner: BOB, subaccount: null },
        amount: 150_000_000n,
        fee: FEE,
        memo,
        from_subaccount: null,
        created_at_time: null,
      },
    })
  })

  it("gives each transfer its own 16-byte memo", () => {
    const form = { to: BOB, amount: "1" }
    const first = readTransferForm(form, token)
    const second = readTransferForm(form, token)
    if (!first.ok || !second.ok) throw new Error("refused")
    expect(first.arg.memo).toHaveLength(16)
    expect(second.arg.memo).toHaveLength(16)
    expect(second.arg.memo).not.toEqual(first.arg.memo)
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
  const cases: [string, Icrc1TransferError, string][] = [
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

describe("the time a transfer is sent with", () => {
  const read = (): TransferArg => {
    const form = readTransferForm({ to: BOB, amount: "1" }, token)
    if (!form.ok) throw new Error(`refused: ${form.reason}`)
    return form.arg
  }
  const ledgerOf = (made: TestWallet) =>
    made.client.canister<Ledger>(ledgerActor, { id: ICP_LEDGER })

  it("stamps a new transfer with the time the client reads from the IC", async () => {
    const made = (wallet = createTestWallet())
    const ledger = ledgerOf(made)
    // A time no `Date.now()` gives: it is not a whole millisecond.
    const asked: unknown[] = []
    const ic = {
      time: (canister: unknown) => {
        asked.push(canister)
        return Promise.resolve(1_700_000_000_123_456_789n)
      },
    }
    const arg = read()

    expect(await stamped(ic, ledger, arg)).toEqual({
      ...arg,
      created_at_time: 1_700_000_000_123_456_789n,
    })
    // The time is the ledger's subnet's, and the form's argument is left as
    // it was.
    expect(asked).toEqual([ledger])
    expect(arg.created_at_time).toBeNull()
  })

  it("reads that time from the replica, through the real client", async () => {
    const made = (wallet = createTestWallet())
    const before = BigInt(Date.now()) * 1_000_000n
    const sent = await stamped(made.client, ledgerOf(made), read())
    // The in-memory replica runs on this process's clock.
    expect(sent.created_at_time).toBeGreaterThanOrEqual(before)
    expect(sent.created_at_time).toBeLessThan(before + 60_000_000_000n)
  })

  it("hands back a transfer that has its time as it is, and asks for no time", async () => {
    const made = (wallet = createTestWallet())
    const never = {
      time: () => Promise.reject(new Error("asked for the time")),
    }
    const sent = { ...read(), created_at_time: 5n }
    // The same object: `client.resendOf` holds a re-send to it.
    expect(await stamped(never, ledgerOf(made), sent)).toBe(sent)
  })
})

describe("deduplication on the ledger", () => {
  const arg = (read: ReturnType<typeof readTransferForm>): TransferArg => {
    if (!read.ok) throw new Error(`refused: ${read.reason}`)
    return read.arg
  }

  it("executes two transfers of the same amount stamped with the same time, and answers a re-send Duplicate of its own block", async () => {
    const made = createTestWallet()
    wallet = made
    made.setBalance(SEED_1, 7n * ICP)
    const ledger = made.client.canister<Ledger>(ledgerActor, { id: ICP_LEDGER })
    // The IC's time moves about once a second: two presses within that
    // second are stamped alike, and only their memos tell them apart.
    const created_at_time = await made.client.time(ledger)
    const form = { to: BOB, amount: "1" }
    const first = { ...arg(readTransferForm(form, token)), created_at_time }
    const second = { ...arg(readTransferForm(form, token)), created_at_time }

    // The first one runs (block 0), but its reply is lost.
    made.dropNextReply()
    const lost = await ledger.icrc1_transfer(first).then(
      () => undefined,
      (error: unknown) => error
    )
    expect(isReactorError(lost) && lost.mayHaveExecuted).toBe(true)

    // The second transfer and the first one's re-send, at once.
    const [paid, resent] = await Promise.allSettled([
      ledger.icrc1_transfer(second),
      ledger.icrc1_transfer(first),
    ])
    // The second is a transfer of its own, not the first one's duplicate.
    expect(paid).toEqual({ status: "fulfilled", value: 1n })
    // The re-send of the first is answered Duplicate, with the first's block.
    expect(resent.status).toBe("rejected")
    const err = resent.status === "rejected" ? resent.reason : undefined
    expect(
      isReactorError(err) && err.kind === "canister_err" && err.err
    ).toEqual({ tag: "Duplicate", value: { duplicate_of: 0n } })
    // Two transfers paid, each once.
    expect(made.balanceOf(BOB)).toBe(2n * ICP)
    expect(made.balanceOf(SEED_1)).toBe(5n * ICP - 2n * FEE)
  })
})
