// Tests of the driver's run order and transcript parsing.
//
//   node --test harness/drive.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { describe, it } from "node:test"
import { agentOutcome, plan } from "../drive.mjs"
import { EVALS } from "./assemble.mjs"

/** `drive.mjs --pilot --dry-run` with `extra`; no credential is needed. */
function dryRun(extra = []) {
  const r = spawnSync(
    process.execPath,
    [
      join(EVALS, "drive.mjs"),
      "--pilot",
      "--prompt",
      "minimal",
      "--mode",
      "tsc-only",
      "--dry-run",
      ...extra,
    ],
    {
      cwd: EVALS,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: "utf8",
    }
  )
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

describe("conditions of a batch", () => {
  it("are the pilots' four when none is named: v4 is never in by default", () => {
    assert.match(
      dryRun(),
      /^cells: 8 \(tasks: node-tool, react-wallet; conditions: v3, thin, thin-guide, v4-proto\)$/m
    )
  })
  it("are the named ones: Addendum 3's v4 and thin-guide", () => {
    const out = dryRun(["--condition", "v4", "--condition", "thin-guide"])
    assert.match(
      out,
      /^cells: 4 \(tasks: node-tool, react-wallet; conditions: v4, thin-guide\)$/m
    )
    assert.match(out, /^runs: 20 \(5 per cell\)/m)
    assert.match(
      out,
      /^ {2}react-wallet × v4: 5 runs; docs\/: llms\.txt; minimal prompt/m
    )
  })
})

describe("plan", () => {
  const args = { tasks: ["a", "b"], conditions: ["x", "y", "z"], n: 4, seed: 7 }
  const runs = plan(args)
  it("is round-robin: every round holds every cell once", () => {
    assert.equal(runs.length, 24)
    for (let round = 1; round <= 4; round += 1) {
      const cells = runs.slice((round - 1) * 6, round * 6)
      assert.ok(cells.every((r) => r.i === round))
      assert.equal(
        new Set(cells.map((r) => `${r.task}/${r.condition}`)).size,
        6
      )
    }
  })
  it("shuffles within rounds, deterministically per seed", () => {
    const orders = [0, 1, 2, 3].map((k) =>
      runs
        .slice(k * 6, k * 6 + 6)
        .map((r) => r.task + r.condition)
        .join()
    )
    assert.ok(new Set(orders).size > 1, "every round in the same order")
    assert.deepEqual(plan(args), runs)
    assert.notDeepEqual(plan({ ...args, seed: 8 }), runs)
  })
})

describe("agentOutcome", () => {
  const result = (extra) =>
    JSON.stringify({
      type: "result",
      num_turns: 9,
      usage: { input_tokens: 100, output_tokens: 20 },
      total_cost_usd: 0.3,
      ...extra,
    })
  it("reads a normal exit with turns, tokens and cost", () => {
    const o = agentOutcome(
      `{"type":"system"}\n${result({ subtype: "success" })}\n`,
      { timedOut: false }
    )
    assert.deepEqual(
      [o.exit, o.turns, o.tokens.input, o.tokens.output, o.costUsd],
      ["normal", 9, 100, 20, 0.3]
    )
  })
  it("tells max-turns, timeout and a missing result apart", () => {
    assert.equal(
      agentOutcome(result({ subtype: "error_max_turns" }), { timedOut: false })
        .exit,
      "max_turns"
    )
    assert.equal(
      agentOutcome(result({ subtype: "success" }), { timedOut: true }).exit,
      "timeout"
    )
    assert.equal(
      agentOutcome("not json", { timedOut: false }).exit,
      "no_result"
    )
    assert.equal(
      agentOutcome(result({ subtype: "error_during_execution" }), {
        timedOut: false,
      }).exit,
      "error"
    )
  })
})

describe("rate-limit detection (assumed CLI shapes; see drive.mjs)", () => {
  const line = (o) => JSON.stringify(o)
  it("an error result naming a usage limit, with its reset time", () => {
    const o = agentOutcome(
      line({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "Claude AI usage limit reached|1760000000",
      }),
      { timedOut: false }
    )
    assert.equal(o.exit, "rate_limited")
    assert.equal(o.rateLimitedUntil, 1760000000 * 1000)
  })
  it("an API 429 / overloaded error, in the result or on stderr only", () => {
    const apiError = line({
      type: "result",
      subtype: "success",
      is_error: true,
      result:
        'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}',
    })
    assert.equal(
      agentOutcome(apiError, { timedOut: false }).exit,
      "rate_limited"
    )
    const overloaded = line({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "API Error: 529 overloaded_error",
    })
    assert.equal(
      agentOutcome(overloaded, { timedOut: false }).exit,
      "rate_limited"
    )
    assert.equal(
      agentOutcome("", {
        timedOut: false,
        stderr: "Error: 429 Too Many Requests",
      }).exit,
      "rate_limited"
    )
  })
  it("is never a successful run, however much its prose talks about HTTP 429", () => {
    const talk = [
      line({
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: "An HTTP 429 means rate limited, so classify it as not delivered.",
            },
          ],
        },
      }),
      line({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done: 429 is handled as a rate limit.",
      }),
    ].join("\n")
    assert.equal(agentOutcome(talk, { timedOut: false }).exit, "normal")
    const maxTurns = line({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      result: "",
    })
    assert.equal(agentOutcome(maxTurns, { timedOut: false }).exit, "max_turns")
  })
})

describe("sign-in and limit errors (CLI 2.1.285 result shapes)", () => {
  const result = (o) =>
    JSON.stringify({ type: "result", num_turns: 1, usage: {}, ...o })
  it("'Not logged in · Please run /login' (subtype success, is_error true) is a sign-in error", () => {
    const o = agentOutcome(
      result({
        subtype: "success",
        is_error: true,
        result: "Not logged in · Please run /login",
        api_error_status: null,
      }),
      { timedOut: false }
    )
    assert.equal(o.exit, "sign_in_error")
    assert.match(o.signInMessage, /Not logged in/)
  })
  it("api_error_status 401 / 403 is a sign-in error, 429 / 529 a limit", () => {
    for (const [status, exit] of [
      [401, "sign_in_error"],
      [403, "sign_in_error"],
      [429, "rate_limited"],
      [529, "rate_limited"],
    ]) {
      const o = agentOutcome(
        result({
          subtype: "success",
          is_error: true,
          result: "API Error",
          api_error_status: status,
        }),
        { timedOut: false }
      )
      assert.equal(o.exit, exit, `status ${status}`)
    }
  })
  it("a successful, non-error result is normal whatever api_error_status says", () => {
    const o = agentOutcome(
      result({
        subtype: "success",
        is_error: false,
        result: "ok",
        api_error_status: 429,
      }),
      { timedOut: false }
    )
    assert.equal(o.exit, "normal")
    assert.equal(o.resultText, "ok")
  })
})
