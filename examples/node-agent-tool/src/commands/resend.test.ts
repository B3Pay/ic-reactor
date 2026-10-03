// Scenario 5: after an outcome nobody knows, the same argument is re-sent,
// never a new transfer, and the ledger's deduplication tells what happened.
import { principal } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import type { MockLedger } from "../mock-ledger.ts"
import {
  createCli,
  generatePem,
  NOW,
  type Doc,
  type TestClient,
} from "../test-kit.ts"

const sender = generatePem("secp256k1")
const TO = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const PEM = ["--pem", "me.pem"]
const START = 1_000_000_000n

const setup = () =>
  createCli({
    files: { "me.pem": sender.pem },
    ledger: { balances: [[sender.principal, START]] },
  })

const resendOf = (doc: Doc | undefined): string[] => {
  const argv = doc?.resend
  if (!Array.isArray(argv) || !argv.every((a) => typeof a === "string")) {
    throw new Error(`no re-send command in ${JSON.stringify(doc)}`)
  }
  return argv
}

describe("the same argument, re-sent", () => {
  it("prints the exact command; run, it answers Duplicate and moves nothing twice", async () => {
    const { cli, ledger } = setup()
    const lost = await cli(
      ["transfer", TO, "2", "--memo", "0a0b", "--json", ...PEM],
      { before: (test) => test.dropNextReply() }
    )
    expect(lost.exitCode).toBe(6)
    const doc = lost.docs[0]
    expect(doc).toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
      balance: {
        before: { units: "1000000000" },
        after: { units: "799990000" },
      },
      dedupUntil: "2026-10-02T00:00:00.000Z",
    })
    const resend = resendOf(doc)
    expect(resend).toEqual([
      "transfer",
      TO,
      "2",
      "--fee",
      "0.0001",
      "--created-at-time",
      String(NOW),
      "--memo",
      "0a0b",
      "--ledger",
      "icp",
      "--pem",
      "me.pem",
    ])

    const again = await cli([...resend, "--json"])
    expect(again.exitCode).toBe(0)
    expect(again.docs[0]).toMatchObject({
      ok: true,
      outcome: "duplicate",
      block: "0",
      resent: false,
    })
    // Two sends of one argument by one sender; one debit.
    expect(ledger.received).toHaveLength(2)
    expect(ledger.received[1]).toEqual(ledger.received[0])
    expect(
      ledger.balanceOf({ owner: sender.principal, subaccount: null })
    ).toBe(START - 200_000_000n - 10_000n)
  })

  it("--resend-unknown re-sends once by itself: Duplicate means it had gone through", async () => {
    const { cli, ledger } = setup()
    const human = await cli(["transfer", TO, "2", "--resend-unknown", ...PEM], {
      before: (test) => test.dropNextReply(),
    })
    expect(human.exitCode).toBe(0)
    expect(human.stdout.join("\n")).toMatch(
      /the re-send answered Duplicate: the first attempt had gone through, in block 0/
    )
    expect(human.requests.filter((r) => r.endpoint === "call")).toHaveLength(2)
    expect(ledger.received[1]).toEqual(ledger.received[0])
    expect(ledger.received[0]?.arg.created_at_time).toBe(NOW)

    const json = await cli(
      ["transfer", TO, "3", "--resend-unknown", "--json", ...PEM],
      { before: (test) => test.dropNextReply() }
    )
    expect(json.docs).toEqual([
      expect.objectContaining({
        ok: true,
        outcome: "duplicate",
        block: "1",
        resent: true,
        firstAttempt: expect.objectContaining({
          kind: "outcome_unknown",
          mayHaveExecuted: true,
        }),
      }),
    ])
  })

  it("--resend-unknown after a reject that changed nothing: the re-send is the transfer", async () => {
    const { cli, ledger } = setup()
    const result = await cli(
      ["transfer", TO, "2", "--resend-unknown", "--json", ...PEM],
      { before: () => ledger.rejectNextTransfer(5) }
    )
    expect(result.exitCode).toBe(0)
    expect(result.docs[0]).toMatchObject({
      outcome: "sent",
      block: "0",
      resent: true,
      firstAttempt: { kind: "rejected", mayHaveExecuted: true },
    })
    expect(
      ledger.balanceOf({ owner: sender.principal, subaccount: null })
    ).toBe(START - 200_000_000n - 10_000n)
  })

  it("re-sends only once: a second unknown outcome prints the command again", async () => {
    const { cli, ledger } = setup()
    let attempts = 0
    const result = await cli(
      ["transfer", TO, "2", "--resend-unknown", "--json", ...PEM],
      {
        // The first attempt is rejected (code 4), and the reply to the
        // second is lost: two outcomes nobody knows, in a row.
        before: (test) =>
          ledger.mountOn(test, {
            icrc1_transfer: () => {
              attempts += 1
              if (attempts > 1) return { tag: "Ok", value: 0n }
              test.dropNextReply()
              return test.reject(4)
            },
          }),
      }
    )
    expect(result.exitCode).toBe(6)
    expect(result.docs[0]).toMatchObject({
      kind: "outcome_unknown",
      firstAttempt: { kind: "rejected", mayHaveExecuted: true },
      resendAttempt: { kind: "outcome_unknown", mayHaveExecuted: true },
    })
    expect(resendOf(result.docs[0])).toContain("--created-at-time")
    expect(attempts).toBe(2)
    expect(result.requests.filter((r) => r.endpoint === "call")).toHaveLength(2)
  })

  it("never re-sends after a failure that proves nothing ran", async () => {
    const { cli, ledger } = setup()
    const result = await cli([
      "transfer",
      TO,
      "100",
      "--resend-unknown",
      "--json",
      ...PEM,
    ])
    expect(result.exitCode).toBe(9)
    expect(ledger.received).toHaveLength(1)
  })
})

/**
 * Loses the reply to the first attempt (the ledger runs it), then calls `arm`
 * while the ledger answers the balance read back after it: what `arm` sets up
 * meets the re-send, the next request.
 */
const loseTheFirstThen =
  (ledger: MockLedger, arm: (test: TestClient, ledger: MockLedger) => void) =>
  (test: TestClient) => {
    test.dropNextReply()
    let reads = 0
    ledger.mountOn(test, {
      icrc1_balance_of: (account) => {
        reads += 1
        if (reads === 2) arm(test, ledger)
        return ledger.balanceOf(account)
      },
    })
  }

/** 6 tokens of 10, sent once: what the first attempt leaves. */
const AFTER_THE_FIRST = START - 600_000_000n - 10_000n

describe("a re-send that does not go through settles nothing", () => {
  // Each way the re-send can fail for certain after a lost first reply. None
  // tells whether the first attempt ran: a ledger answers some Errs before it
  // looks for a duplicate, and the other failures never reached it. In each
  // case below the first attempt did run.
  const cases: ReadonlyArray<{
    readonly name: string
    readonly arm: (test: TestClient, ledger: MockLedger) => void
    readonly resendAttempt: Doc
    /** How the person's report names what the re-send got. */
    readonly got: RegExp
    /** Whether the replica refused each call it received, in order. */
    readonly calls: readonly boolean[]
  }> = [
    {
      name: "refused with HTTP 429 three times: not_delivered",
      arm: (test) => test.refuseNext(429, 3),
      resendAttempt: {
        kind: "not_delivered",
        mayHaveExecuted: false,
        httpStatus: 429,
      },
      got: /The re-send did not go through \(not_delivered: /,
      calls: [false, true, true, true],
    },
    {
      name: "rejected before the ledger ran it: reject code 3",
      arm: (_test, ledger) => ledger.rejectNextTransfer(3),
      resendAttempt: {
        kind: "rejected",
        mayHaveExecuted: false,
        rejectCode: 3,
      },
      got: /The re-send did not go through \(rejected: /,
      calls: [false, false],
    },
    {
      // A disposed client calls as nobody, so it refuses a write before
      // sending it: unauthenticated, not cancelled.
      name: "refused by the client before it was sent: the client was disposed",
      arm: (test) => test.client.dispose(),
      resendAttempt: {
        kind: "unauthenticated",
        mayHaveExecuted: false,
        code: "anonymous_write",
      },
      got: /The re-send did not go through \(unauthenticated: /,
      calls: [false],
    },
    {
      name: "answered InsufficientFunds",
      arm: (_test, ledger) =>
        ledger.answerNextTransfer({
          tag: "InsufficientFunds",
          value: { balance: AFTER_THE_FIRST },
        }),
      resendAttempt: {
        kind: "canister_err",
        mayHaveExecuted: false,
        err: { tag: "InsufficientFunds", value: { balance: "399990000" } },
      },
      got: /The re-send did not go through \(the ledger answered InsufficientFunds, not Duplicate\)/,
      calls: [false, false],
    },
    {
      name: "answered TemporarilyUnavailable",
      arm: (_test, ledger) =>
        ledger.answerNextTransfer({ tag: "TemporarilyUnavailable" }),
      resendAttempt: {
        kind: "canister_err",
        mayHaveExecuted: false,
        err: { tag: "TemporarilyUnavailable" },
      },
      got: /\(the ledger answered TemporarilyUnavailable, not Duplicate\)/,
      calls: [false, false],
    },
    {
      name: "answered BadFee",
      arm: (_test, ledger) =>
        ledger.answerNextTransfer({
          tag: "BadFee",
          value: { expected_fee: 20_000n },
        }),
      resendAttempt: {
        kind: "canister_err",
        mayHaveExecuted: false,
        err: { tag: "BadFee", value: { expected_fee: "20000" } },
      },
      got: /\(the ledger answered BadFee, not Duplicate\)/,
      calls: [false, false],
    },
  ]

  it.each(cases)(
    "re-send $name: the first attempt may still have executed",
    async ({ arm, resendAttempt, got, calls }) => {
      const argv = ["transfer", TO, "6", "--resend-unknown", ...PEM]

      const human = setup()
      const told = await human.cli(argv, {
        before: loseTheFirstThen(human.ledger, arm),
      })
      expect(told.exitCode).toBe(6)
      const text = told.stderr.join("\n")
      expect(text).toMatch(/^error: outcome_unknown: /)
      expect(text).toMatch(/may have executed: yes/)
      expect(text).toMatch(got)
      expect(text).toMatch(
        /That does not tell whether the first attempt did: it may still have executed\./
      )
      // The first attempt's advice, not the re-send's.
      expect(text).toMatch(/never send a new one blindly/)
      expect(text).toMatch(/Do not make a new transfer\. Re-send this same one/)
      expect(text).toContain(
        `node src/cli.ts transfer ${TO} 6 --fee 0.0001 --created-at-time ${NOW}`
      )
      // Nothing the re-send alone would advise: it moved nothing, the first may have.
      expect(text).not.toMatch(
        /may have executed: no|safe to run again|Nothing moved|nothing executed|try again later|leave out --fee|that answer is final|Pass --pem/
      )
      expect(
        told.requests
          .filter((r) => r.endpoint === "call")
          .map((r) => "refused" in r)
      ).toEqual(calls)
      expect(
        human.ledger.balanceOf({ owner: sender.principal, subaccount: null })
      ).toBe(AFTER_THE_FIRST)

      const agent = setup()
      const json = await agent.cli([...argv, "--json"], {
        before: loseTheFirstThen(agent.ledger, arm),
      })
      expect(json.exitCode).toBe(6)
      expect(json.docs).toHaveLength(1)
      const doc = json.docs[0]
      expect(doc).toMatchObject({
        ok: false,
        command: "transfer",
        kind: "outcome_unknown",
        mayHaveExecuted: true,
        firstAttempt: { kind: "outcome_unknown", mayHaveExecuted: true },
        resendAttempt,
        balance: { before: { units: String(START) } },
        dedupUntil: "2026-10-02T00:00:00.000Z",
      })
      expect(doc).not.toHaveProperty("err")
      expect(resendOf(doc)).toEqual([
        "transfer",
        TO,
        "6",
        "--fee",
        "0.0001",
        "--created-at-time",
        String(NOW),
        "--ledger",
        "icp",
        "--pem",
        "me.pem",
      ])
    }
  )
})
