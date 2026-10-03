// Scenario 5: one exit code per ReactorError kind, read from errors the real
// client produced. (Every kind a transfer can end in is also run end to end
// in src/commands/transfer.test.ts.)
import { createTestClient } from "@ic-reactor/core/testing"
import { describe, expect, it } from "vitest"
import { EXIT_CODES, failureOf } from "./failure.ts"
import { UsageError } from "./input.ts"
import { LEDGERS, ledgerOn } from "./ledgers.ts"

describe("exit codes", () => {
  it("are one per outcome, and none is shared", () => {
    expect(EXIT_CODES).toEqual({
      ok: 0,
      unexpected: 1,
      usage: 2,
      invalid_args: 3,
      unauthenticated: 4,
      not_delivered: 5,
      outcome_unknown: 6,
      rejected: 7,
      invalid_reply: 8,
      canister_err: 9,
      cancelled: 10,
    })
    expect(new Set(Object.values(EXIT_CODES)).size).toBe(11)
  })

  it("10 cancelled: a call on a client that was disposed is never sent", async () => {
    const { client, requests } = createTestClient()
    const ledger = ledgerOn(client, LEDGERS.icp)
    client.dispose()
    const error: unknown = await ledger.icrc1_fee().then(
      () => undefined,
      (rejection: unknown) => rejection
    )
    expect(failureOf(error)).toMatchObject({
      kind: "cancelled",
      mayHaveExecuted: false,
      exitCode: 10,
      details: { code: "client_disposed" },
    })
    expect(requests.filter((r) => r.endpoint !== "status")).toEqual([])
  })

  it("2 usage and 1 unexpected, for what is not a ReactorError", () => {
    expect(failureOf(new UsageError("no"))).toMatchObject({
      kind: "usage",
      exitCode: 2,
      mayHaveExecuted: false,
    })
    expect(failureOf(new Error("bug"))).toMatchObject({
      kind: "unexpected",
      exitCode: 1,
      mayHaveExecuted: false,
    })
    // After a write was sent, a failure that proves nothing may have executed.
    expect(failureOf(new Error("bug"), true).mayHaveExecuted).toBe(true)
  })
})
