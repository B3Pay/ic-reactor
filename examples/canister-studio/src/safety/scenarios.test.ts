import { principal } from "@meantjs/schema"
import { isReactorError } from "@ic-reactor/core"
import { describe, expect, it } from "vitest"
import {
  SCENARIOS,
  sendTransferInLab,
  type Scenario,
  type ScenarioResult,
} from "./scenarios.ts"

const scenario = (id: string): Scenario => {
  const found = SCENARIOS.find((s) => s.id === id)
  if (found === undefined) throw new Error(`no scenario ${id}`)
  return found
}

const failedChecks = (result: ScenarioResult) =>
  result.steps.filter((s) => s.status === "fail")

describe("the scenarios", () => {
  it("are the ten of the lab, each with a unique id and its texts", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      "anonymous-write",
      "invalid-args",
      "lost-reply",
      "http-429",
      "reject-5",
      "reject-3",
      "canister-err",
      "caller-changed",
      "cache-isolation",
      "certified-twin",
    ])
    for (const s of SCENARIOS) {
      expect(s.title).not.toBe("")
      expect(s.rule).not.toBe("")
      expect(s.narrative).not.toBe("")
      expect(s.expected).not.toBe("")
      expect(s.code).not.toBe("")
    }
  })

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    "%s: every check holds, so the verdict passes",
    async (_id, s) => {
      const result = await s.run()
      expect(failedChecks(result)).toEqual([])
      expect(result.verdict.pass).toBe(true)
      expect(
        result.steps.filter((step) => step.status === "pass").length
      ).toBeGreaterThan(2)
    }
  )
})

describe("what the scenarios hand the page", () => {
  it("anonymous write: the refusal, and an empty request log", async () => {
    const result = await scenario("anonymous-write").run()
    expect(result.requests).toEqual([])
    expect(isReactorError(result.error) && result.error.code).toBe(
      "anonymous_write"
    )
  })

  it("invalid arguments: the refused values for the form, with the issue's path", async () => {
    const result = await scenario("invalid-args").run()
    expect(result.form?.method).toBe("icrc1_transfer")
    expect(result.form?.values).toHaveLength(1)
    expect(
      isReactorError(result.error) && result.error.issues?.map((i) => i.path)
    ).toEqual(["$args[0].to.owner"])
    expect(result.requests).toEqual([])
  })

  it("lost reply: a dropped call, the re-send, the Duplicate and the balance", async () => {
    const result = await scenario("lost-reply").run()
    const transfers = result.requests.filter(
      (r) => r.methodName === "icrc1_transfer"
    )
    expect(transfers.map((r) => r.dropped === true)).toEqual([true, false])
    expect(new Set(transfers.map((r) => r.caller)).size).toBe(1)
    const [duplicate] = result.moreErrors ?? []
    expect(isReactorError(duplicate?.error) && duplicate.error.kind).toBe(
      "canister_err"
    )
    expect(result.reply).toEqual({
      method: "icrc1_balance_of",
      value: 100_000_000n - 25_000n - 10n,
      tokens: true,
    })
  })

  it("caller changed: the refused re-send is shown as one, so it never reads as settling the transfer", async () => {
    const result = await scenario("caller-changed").run()
    const [refused] = result.moreErrors ?? []
    expect(isReactorError(refused?.error) && refused.error.code).toBe(
      "caller_changed"
    )
    expect(refused?.afterResend).toBe(true)
  })

  it("429: two calls in the log, the first refused, and the block index", async () => {
    const result = await scenario("http-429").run()
    const transfers = result.requests.filter(
      (r) => r.methodName === "icrc1_transfer"
    )
    expect(transfers).toHaveLength(2)
    expect(transfers[0]?.refused).toMatch(/429/)
    expect(result.reply).toEqual({
      method: "icrc1_transfer",
      value: 0n,
      tokens: false,
    })
  })

  it("certified twin: the plain read is a query, the certified one a call", async () => {
    const result = await scenario("certified-twin").run()
    expect(
      result.requests
        .filter((r) => r.methodName === "icrc1_balance_of")
        .map((r) => r.endpoint)
    ).toEqual(["query", "call"])
  })
})

describe("sendTransferInLab", () => {
  const corrected = {
    to: {
      owner: principal(
        "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
      ),
      subaccount: null,
    },
    amount: 100_000n,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  }

  it("sends a transfer that encodes and reports its block index", async () => {
    const outcome = await sendTransferInLab(corrected)
    expect(outcome.ok && outcome.block).toBe(0n)
    expect(outcome.requests.map((r) => r.methodName)).toContain(
      "icrc1_transfer"
    )
  })

  it("reports a transfer that does not encode without sending it", async () => {
    const outcome = await sendTransferInLab({ ...corrected, amount: -1n })
    expect(outcome.ok).toBe(false)
    expect(
      !outcome.ok && isReactorError(outcome.error) && outcome.error.kind
    ).toBe("invalid_args")
    expect(outcome.requests).toEqual([])
  })
})
