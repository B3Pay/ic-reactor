// Scenario 5: after an outcome nobody knows, the same argument is re-sent,
// never a new transfer, and the ledger's deduplication tells what happened.
import { principal } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import { createCli, generatePem, NOW, type Doc } from "../test-kit.ts"

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
