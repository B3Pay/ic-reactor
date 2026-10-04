// Tests of the driver's run order and transcript parsing.
//
//   node --test harness/drive.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { agentOutcome, plan, refuseChangedV4Source } from "../drive.mjs"
import { EVALS } from "./assemble.mjs"
import { v4Source } from "./ship.mjs"

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
  it("name the source of the v4 packages when v4 is in, and only then", () => {
    const out = dryRun(["--condition", "v4", "--condition", "thin-guide"])
    assert.match(out, /^v4 built from: .+ \(recorded in plan\.json\)$/m)
    assert.doesNotMatch(dryRun(), /^v4 built from:/m)
  })
  it("plan Addendum 4's GA batch: 80 runs, 20 per cell, in a shuffle seeded 20261005", () => {
    const out = dryRun([
      "--n",
      "20",
      "--seed",
      "20261005",
      "--condition",
      "v4",
      "--condition",
      "thin-guide",
    ])
    assert.match(
      out,
      /^runs: 80 \(20 per cell\), round-robin in a shuffle seeded 20261005;/m
    )
    assert.match(
      out,
      new RegExp(
        "first runs, in order:\\n" +
          [
            "node-tool/thin-guide#1",
            "react-wallet/thin-guide#1",
            "node-tool/v4#1",
            "react-wallet/v4#1",
            "node-tool/thin-guide#2",
            "node-tool/v4#2",
            "react-wallet/v4#2",
            "react-wallet/thin-guide#2",
          ]
            .map((run) => `  ${run}\\n`)
            .join("")
      )
    )
    for (const task of ["node-tool", "react-wallet"])
      for (const condition of ["v4", "thin-guide"])
        assert.match(
          out,
          new RegExp(`^  ${task} × ${condition}: 20 runs;`, "m")
        )
  })
})

describe("a new batch's --out directory", () => {
  let used
  let empty
  /** Every file under `dir`, with its contents. */
  const tree = (dir) =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name))
      .sort()
      .map((p) => [p, readFileSync(p, "utf8")])
  /** A real (not dry) batch with a stub agent; no credential is needed. */
  const batch = (out, extra = []) =>
    spawnSync(
      process.execPath,
      [
        join(EVALS, "drive.mjs"),
        "--task",
        "node-tool",
        "--condition",
        "thin",
        "--n",
        "1",
        "--model",
        "stub",
        "--mode",
        "tsc-only",
        "--agent-cmd",
        "true",
        "--out",
        out,
        ...extra,
      ],
      {
        cwd: EVALS,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        encoding: "utf8",
        timeout: 120_000,
      }
    )
  before(() => {
    // An earlier batch's records: its plan, and the run this batch would
    // plan (node-tool/thin#1), already run and scored.
    used = mkdtempSync(join(tmpdir(), "drive-out-used-"))
    const run = join(used, "node-tool", "thin", "001")
    mkdirSync(run, { recursive: true })
    writeFileSync(join(used, "plan.json"), '{"batch":"earlier"}\n')
    writeFileSync(join(run, "agent.json"), '{"model":"earlier"}\n')
    writeFileSync(
      join(run, "score.json"),
      JSON.stringify({
        task: "node-tool",
        condition: "thin",
        run: 1,
        model: "earlier",
        harnessError: "an earlier batch's record",
        harnessKind: "harness",
      }) + "\n"
    )
    empty = mkdtempSync(join(tmpdir(), "drive-out-empty-"))
  })
  after(() => {
    rmSync(used, { recursive: true, force: true })
    rmSync(empty, { recursive: true, force: true })
  })

  it("is refused when it already holds files, and nothing in it changes", () => {
    const before = tree(used)
    const r = batch(used)
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.match(
      r.stderr,
      /already holds files: a new batch needs a new or empty directory/
    )
    assert.match(r.stderr, new RegExp(`--resume ${used}`))
    assert.deepEqual(tree(used), before)
  })

  it("is refused by a dry run as well", () => {
    const r = batch(used, ["--dry-run"])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /already holds files/)
  })

  it("may be an empty directory", () => {
    const r = batch(empty, ["--dry-run"])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, new RegExp(`^results: ${empty}/`, "m"))
  })
})

describe("resuming a batch whose v4 source changed", () => {
  const npm = {
    from: "npm",
    version: "4.0.0-beta.1",
    packages: {
      "@ic-reactor/core": "4.0.0-beta.1",
      "@ic-reactor/react": "4.0.0-beta.1",
    },
    integrity: {
      "@ic-reactor/core": "sha512-a",
      "@ic-reactor/react": "sha512-b",
    },
    guide: { words: 1974, sha256: "c" },
  }
  it("goes on when .ship/v4 still holds the planned source, keys in any order", () => {
    const reordered = Object.fromEntries(Object.entries(npm).reverse())
    refuseChangedV4Source(npm, reordered)
  })
  it("goes on for a plan from before v4Source was recorded", () => {
    refuseChangedV4Source(undefined, npm)
  })
  it("refuses a source rebuilt from the tree, naming both", () => {
    const tree = { ...npm, from: "tree", commit: "abc", dirty: false }
    delete tree.version
    assert.throws(
      () => refuseChangedV4Source(npm, tree),
      /planned with the v4 packages from npm 4\.0\.0-beta\.1.*now holds packed from this repository at abc/s
    )
  })
  it("refuses another tarball of the same version, and a missing source", () => {
    const other = {
      ...npm,
      integrity: { ...npm.integrity, "@ic-reactor/core": "sha512-z" },
    }
    assert.throws(() => refuseChangedV4Source(npm, other), /--resume/)
    assert.throws(
      () => refuseChangedV4Source(npm, null),
      /no \.ship\/v4\/source\.json/
    )
  })
})

describe("a batch's plan.json", () => {
  let dir
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "drive-plan-"))
  })
  after(() => rmSync(dir, { recursive: true, force: true }))
  /**
   * A real (not dry) batch with a stub agent whose preflight fails, so it
   * stops right after writing plan.json; no credential is needed.
   */
  const planOf = (condition) => {
    const out = join(dir, condition)
    const r = spawnSync(
      process.execPath,
      [
        join(EVALS, "drive.mjs"),
        "--task",
        "node-tool",
        "--condition",
        condition,
        "--n",
        "1",
        "--model",
        "stub",
        "--mode",
        "tsc-only",
        "--agent-cmd",
        "true",
        "--preflight-cmd",
        "false",
        "--out",
        out,
      ],
      {
        cwd: EVALS,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        encoding: "utf8",
        timeout: 60_000,
      }
    )
    assert.match(r.stderr, /preflight failed/, r.stdout + r.stderr)
    return JSON.parse(readFileSync(join(out, "plan.json"), "utf8"))
  }

  it("records the v4 source (Addendum 4's pass rule reads v4Source) when v4 is in", () => {
    const p = planOf("v4")
    assert.ok("v4Source" in p, "plan.json has no v4Source")
    // null only when setup has not recorded a source (.ship/v4/source.json).
    assert.deepEqual(p.v4Source, v4Source())
  })
  it("has no v4Source when v4 is not in the batch", () => {
    assert.ok(!("v4Source" in planOf("thin")))
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
