// Scenario 5: writes. A transfer, every way it can fail with its exit code,
// and the re-send of the same argument after an unknown outcome.
import { c, principal } from "@candid-core/schema"
import type { TestHandlers } from "@ic-reactor/core/testing"
import { describe, expect, it } from "vitest"
import { Account, TransferArg, type TransferError } from "../canisters/icrc1.ts"
import { LEDGERS } from "../ledgers.ts"
import { createCli, generatePem, NOW, type TestClient } from "../test-kit.ts"
import { DEDUP_WINDOW_NS } from "./transfer.ts"

const sender = generatePem("ed25519")
const TO = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const PEM = ["--pem", "me.pem"]

/** A CLI whose `--pem me.pem` holds 10 tokens. */
const setup = () =>
  createCli({
    files: { "me.pem": sender.pem },
    ledger: { balances: [[sender.principal, 1_000_000_000n]] },
  })

const calls = (run: { requests: readonly { endpoint: string }[] }) =>
  run.requests.filter((r) => r.endpoint === "call")

describe("a transfer", () => {
  it("sends the amount in base units, the ledger's fee and created_at_time", async () => {
    const { cli, ledger } = setup()
    const result = await cli(["transfer", TO, "1.5", ...PEM])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.join("\n")).toMatch(/outcome\s+sent in block 0/)
    expect(ledger.received).toEqual([
      {
        caller: sender.principal,
        arg: {
          to: { owner: TO, subaccount: null },
          amount: 150_000_000n,
          fee: 10_000n,
          memo: null,
          from_subaccount: null,
          created_at_time: NOW,
        },
      },
    ])
    expect(
      ledger.balanceOf({ owner: sender.principal, subaccount: null })
    ).toBe(849_990_000n)
  })

  it("answers --json with the outcome, bigints as text", async () => {
    const { cli } = setup()
    const memo = "cafe"
    const result = await cli([
      "transfer",
      TO,
      "0.25",
      "--memo",
      memo,
      "--json",
      ...PEM,
    ])
    expect(result.docs).toEqual([
      {
        ok: true,
        command: "transfer",
        outcome: "sent",
        block: "0",
        resent: false,
        network: "ic",
        ledger: { id: LEDGERS.icp, name: "icp" },
        from: { owner: sender.principal, subaccount: null },
        to: { owner: TO, subaccount: null },
        amount: { units: "25000000", tokens: "0.25" },
        fee: { units: "10000", tokens: "0.0001" },
        symbol: "ICP",
        createdAtTime: String(NOW),
      },
    ])
  })
})

describe("exit codes by kind", () => {
  it("2 usage: input refused before any request", async () => {
    const { cli } = setup()
    for (const argv of [
      ["transfer", "bob", "1"],
      ["transfer", TO, "1", "--to-subaccount", "00"],
      ["transfer", TO, "1", "--memo", "xyz"],
      ["transfer", TO, "1", "--created-at-time", "yesterday"],
    ]) {
      const result = await cli([...argv, ...PEM])
      expect(result.exitCode).toBe(2)
      expect(result.requests).toEqual([])
    }
  })

  it("2 usage: an amount parseUnits refuses at the ledger's decimals, no call", async () => {
    const { cli } = setup()
    for (const amount of ["1e3", "1,5", "-1", "0.000000001"]) {
      const result = await cli(["transfer", TO, amount, ...PEM, "--json"])
      expect(result.exitCode).toBe(2)
      expect(result.docs[0]).toMatchObject({
        kind: "usage",
        mayHaveExecuted: false,
      })
      expect(calls(result)).toEqual([])
    }
  })

  it("3 invalid_args: the client refuses to encode a nat64 past its range", async () => {
    const { cli, ledger } = setup()
    const result = await cli([
      "transfer",
      TO,
      "1",
      "--created-at-time",
      String(2n ** 64n),
      "--json",
      ...PEM,
    ])
    expect(result.exitCode).toBe(3)
    expect(result.docs[0]).toMatchObject({
      kind: "invalid_args",
      mayHaveExecuted: false,
    })
    expect(calls(result)).toEqual([])
    expect(ledger.received).toEqual([])
  })

  it("4 unauthenticated: anonymous, refused by the client", async () => {
    const { cli } = setup()
    const result = await cli(["transfer", TO, "1", "--json"])
    expect(result.exitCode).toBe(4)
    expect(calls(result)).toEqual([])
  })

  it("5 not_delivered: throttled three times, re-sent twice by the client, then given up", async () => {
    const { cli, ledger } = setup()
    const result = await cli(["transfer", TO, "1", "--json", ...PEM], {
      before: () => ledger.throttleNextTransfer(3),
    })
    expect(result.exitCode).toBe(5)
    expect(result.docs[0]).toMatchObject({
      kind: "not_delivered",
      mayHaveExecuted: false,
      httpStatus: 429,
    })
    expect(calls(result).map((r) => "refused" in r)).toEqual([true, true, true])
    expect(ledger.received).toEqual([])
  })

  it("0 after one 429: the client re-sends the call once by itself", async () => {
    const { cli, ledger } = setup()
    const result = await cli(["transfer", TO, "1", ...PEM], {
      before: () => ledger.throttleNextTransfer(1),
    })
    expect(result.exitCode).toBe(0)
    expect(calls(result).map((r) => "refused" in r)).toEqual([true, false])
    expect(ledger.received).toHaveLength(1)
  })

  it("6 outcome_unknown: the reply is lost; the balance is read back", async () => {
    const { cli } = setup()
    const result = await cli(["transfer", TO, "2", ...PEM], {
      before: (test) => test.dropNextReply(),
    })
    expect(result.exitCode).toBe(6)
    const text = result.stderr.join("\n")
    expect(text).toMatch(/error: outcome_unknown/)
    expect(text).toMatch(/may have executed: yes/)
    expect(text).toMatch(
      /Balance read back: 7\.9999 ICP, 10 ICP before\. Less by exactly this amount and fee/
    )
    expect(calls(result)).toHaveLength(1)
  })

  it("7 rejected: reject code 4 may have executed; the balance shows it did not", async () => {
    const { cli, ledger } = setup()
    const result = await cli(["transfer", TO, "2", "--json", ...PEM], {
      before: () => ledger.rejectNextTransfer(4),
    })
    expect(result.exitCode).toBe(7)
    expect(result.docs[0]).toMatchObject({
      kind: "rejected",
      rejectCode: 4,
      mayHaveExecuted: true,
      balance: {
        before: { units: "1000000000" },
        after: { units: "1000000000" },
      },
    })
  })

  it("8 invalid_reply: a reply that does not decode, after a write that ran", async () => {
    const { cli } = setup()
    // A canister that answers icrc1_transfer with text instead of a TransferResult.
    const notALedger = c.service({
      icrc1_decimals: c.func([], [c.nat8], "query"),
      icrc1_symbol: c.func([], [c.text], "query"),
      icrc1_fee: c.func([], [c.nat], "query"),
      icrc1_balance_of: c.func([Account], [c.nat], "query"),
      icrc1_transfer: c.func([TransferArg], [c.text], "update"),
    })
    type NotALedger = {
      icrc1_decimals: () => Promise<number>
      icrc1_symbol: () => Promise<string>
      icrc1_fee: () => Promise<bigint>
      icrc1_balance_of: (account: Account) => Promise<bigint>
      icrc1_transfer: (arg: TransferArg) => Promise<string>
    }
    const handlers: TestHandlers<NotALedger> = {
      icrc1_decimals: () => 8,
      icrc1_symbol: () => "ICP",
      icrc1_fee: () => 10_000n,
      icrc1_balance_of: () => 0n,
      icrc1_transfer: () => "done",
    }
    const result = await cli(["transfer", TO, "1", "--json", ...PEM], {
      before: (test) =>
        test.mock<NotALedger>(notALedger, LEDGERS.icp, handlers),
    })
    expect(result.exitCode).toBe(8)
    expect(result.docs[0]).toMatchObject({
      kind: "invalid_reply",
      mayHaveExecuted: true,
    })
  })

  /** Each Err: the arguments that make the mock ledger answer it, or the Err to answer, and how it reads. */
  const refusals: ReadonlyArray<{
    readonly tag: TransferError["tag"]
    readonly args: readonly string[]
    readonly sentence: RegExp
    readonly answer?: TransferError
  }> = [
    {
      tag: "InsufficientFunds",
      args: ["100"],
      sentence: /holds 10 ICP, and this transfer needs 100\.0001 ICP/,
    },
    {
      tag: "BadFee",
      args: ["1", "--fee", "0.001"],
      sentence: /the ledger's fee is 0\.0001 ICP, not 0\.001 ICP/,
    },
    {
      tag: "TooOld",
      args: [
        "1",
        "--created-at-time",
        String(NOW - DEDUP_WINDOW_NS - 3_600_000_000_000n),
      ],
      sentence: /older than the ledger's deduplication window/,
    },
    {
      tag: "CreatedInFuture",
      args: ["1", "--created-at-time", String(NOW + 3_600_000_000_000n)],
      sentence: /ahead of the ledger's clock \(2026-10-01T00:00:00\.000Z\)/,
    },
    {
      tag: "TemporarilyUnavailable",
      args: ["1"],
      sentence: /takes no transfers right now/,
      answer: { tag: "TemporarilyUnavailable" },
    },
    {
      tag: "GenericError",
      args: ["1"],
      sentence: /GenericError 42: frozen\. Nothing moved/,
      answer: {
        tag: "GenericError",
        value: { error_code: 42n, message: "frozen" },
      },
    },
    {
      tag: "BadBurn",
      args: ["1"],
      sentence:
        /a burn \(a transfer to the minting account\) is at least 1 ICP/,
      answer: { tag: "BadBurn", value: { min_burn_amount: 100_000_000n } },
    },
  ]

  it.each(refusals)(
    "9 canister_err: $tag, printed plainly",
    async ({ tag, args, sentence, answer }) => {
      const { cli, ledger } = setup()
      const before =
        answer === undefined
          ? undefined
          : (test: TestClient) =>
              ledger.mountOn(test, {
                icrc1_transfer: () => ({ tag: "Err", value: answer }),
              })
      const human = await cli(["transfer", TO, ...args, ...PEM], { before })
      expect(human.exitCode).toBe(9)
      expect(human.stderr.join("\n")).toMatch(sentence)
      expect(human.stderr.join("\n")).toMatch(/may have executed: no/)
      expect(
        ledger.balanceOf({ owner: sender.principal, subaccount: null })
      ).toBe(1_000_000_000n)

      const json = await cli(["transfer", TO, ...args, ...PEM, "--json"], {
        before,
      })
      expect(json.docs[0]).toMatchObject({
        ok: false,
        kind: "canister_err",
        mayHaveExecuted: false,
        err: { tag },
      })
    }
  )
})
