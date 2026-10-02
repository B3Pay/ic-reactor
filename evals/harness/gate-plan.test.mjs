// Tests of which empty cells the gate may skip (harness/gate-plan.mjs), on
// seeded trees, on this tree, and through gate.mjs itself.
//
//   node --test harness/gate-plan.test.mjs
import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, beforeEach, describe, it } from "node:test"
import { DEFAULT_CONDITIONS, EVALS } from "./assemble.mjs"
import { gatePlan } from "./gate-plan.mjs"

const TASK = "node-tool"

describe("the gate's plan on a seeded tree", () => {
  const root = mkdtempSync(join(tmpdir(), "ic-reactor-evals-gate-test-"))
  const reference = (condition, name = "reference") =>
    mkdirSync(join(root, "tasks", TASK, "solutions", condition, name), {
      recursive: true,
    })
  const faulty = (name, condition) => {
    const dir = join(root, "tasks", TASK, "faulty", name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, "meta.json"),
      JSON.stringify({ condition, expectFail: ["a_test"], bug: "one change" })
    )
  }
  const plan = (require = []) => gatePlan({ tasks: [TASK], require, root })
  const blockedCells = (p) => p.blocked.map((s) => s.cell)

  beforeEach(() => {
    rmSync(join(root, "tasks"), { recursive: true, force: true })
    for (const condition of DEFAULT_CONDITIONS) {
      reference(condition)
      reference(condition, "reference-module-scope")
    }
    faulty("thin-some-bug", "thin")
  })
  after(() => rmSync(root, { recursive: true, force: true }))

  it("skips a condition not yet ported when nothing names it", () => {
    const p = plan()
    assert.deepEqual(p.skipped, [{ cell: `${TASK}/v4`, reasons: [] }])
    assert.deepEqual(p.blocked, [])
    assert.equal(p.cases.length, DEFAULT_CONDITIONS.length * 2 + 1)
    assert.deepEqual(
      p.cases.filter((c) => c.expectFail.length > 0).map((c) => c.name),
      ["thin-some-bug"]
    )
  })
  it("refuses to skip a condition named by --require", () => {
    assert.deepEqual(blockedCells(plan(["v4"])), [`${TASK}/v4`])
    assert.deepEqual(plan(["v4"]).blocked[0].reasons, ["required by --require"])
  })
  it("refuses to skip a condition whose faulty solutions are in the task", () => {
    faulty("v4-some-bug", "v4")
    const p = plan()
    assert.deepEqual(blockedCells(p), [`${TASK}/v4`])
    assert.match(p.blocked[0].reasons.join(), /v4-some-bug/)
  })
  it("refuses to skip a pre-registered condition whose references are gone", () => {
    rmSync(join(root, "tasks", TASK, "solutions", "thin-guide"), {
      recursive: true,
    })
    assert.deepEqual(blockedCells(plan()), [`${TASK}/thin-guide`])
  })
  it("scores a required condition once its references exist", () => {
    reference("v4")
    faulty("v4-some-bug", "v4")
    const p = plan(["v4"])
    assert.deepEqual(p.skipped, [])
    assert.ok(
      p.cases.some((c) => c.condition === "v4" && c.name === "reference")
    )
    assert.ok(
      p.cases.some((c) => c.condition === "v4" && c.name === "v4-some-bug")
    )
  })
  it("refuses an unknown condition or task", () => {
    assert.throws(() => plan(["v5"]), /--require "v5": not a condition/)
    assert.throws(
      () => gatePlan({ tasks: ["no-task"], root }),
      /--task "no-task": not a task/
    )
  })
})

describe("the gate's plan on this tree", () => {
  it("skips no cell and blocks nothing, with --require v4 too", () => {
    for (const require of [[], ["v4"]]) {
      const p = gatePlan({ require })
      assert.deepEqual(p.skipped, [], `--require ${require}`)
      assert.deepEqual(p.blocked, [], `--require ${require}`)
    }
  })
  it("scores both v4 references of each task and the six ported faulty solutions", () => {
    const v4 = gatePlan({ require: ["v4"] }).cases.filter(
      (c) => c.condition === "v4"
    )
    assert.deepEqual(
      v4
        .filter((c) => c.name.startsWith("reference"))
        .map((c) => `${c.task}/${c.name}`)
        .sort(),
      [
        "node-tool/reference",
        "node-tool/reference-module-scope",
        "react-wallet/reference",
        "react-wallet/reference-module-scope",
      ]
    )
    assert.deepEqual(
      v4
        .filter((c) => !c.name.startsWith("reference"))
        .map((c) => `${c.task}/${c.name}`)
        .sort(),
      [
        "node-tool/v4-never-may-have-executed",
        "node-tool/v4-refuses-nat64-max",
        "react-wallet/v4-every-reject-unknown",
        "react-wallet/v4-keep-previous-data",
        "react-wallet/v4-retry-spread",
        "react-wallet/v4-status-not-idle",
      ]
    )
  })
  it("expects each ported faulty solution to fail what its v4-proto original fails", () => {
    const cases = gatePlan().cases
    const ported = cases.filter(
      (c) => c.condition === "v4" && !c.name.startsWith("reference")
    )
    assert.ok(ported.length > 0)
    for (const port of ported) {
      const original = cases.find(
        (c) =>
          c.task === port.task &&
          c.condition === "v4-proto" &&
          c.name === port.name.replace(/^v4-/, "v4-proto-")
      )
      assert.ok(original, `${port.task}/${port.name} has no v4-proto original`)
      assert.deepEqual(
        [...port.expectFail].sort(),
        [...original.expectFail].sort(),
        `${port.task}/${port.name}`
      )
    }
  })
})

describe("gate.mjs", () => {
  /**
   * Runs gate.mjs in a process group of its own. Here it must exit before
   * scoring; if it starts scoring instead, the whole group (its score.mjs,
   * tsc and vitest children) is killed after 15 s rather than left running.
   */
  const gate = (...args) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [join(EVALS, "gate.mjs"), ...args],
        { cwd: EVALS, detached: true, stdio: ["ignore", "pipe", "pipe"] }
      )
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (d) => (stdout += d))
      child.stderr.on("data", (d) => (stderr += d))
      const timer = setTimeout(
        () => process.kill(-child.pid, "SIGKILL"),
        15_000
      )
      child.on("close", (status) => {
        clearTimeout(timer)
        resolve({ status, stdout, stderr })
      })
    })

  /**
   * A tree in which every pre-registered cell of node-tool has its two
   * references (empty directories: the gate must not get as far as scoring
   * them) and the v4 cell has none, as before the v4 port.
   */
  const root = mkdtempSync(join(tmpdir(), "ic-reactor-evals-gate-run-"))
  for (const condition of DEFAULT_CONDITIONS) {
    for (const name of ["reference", "reference-module-scope"]) {
      mkdirSync(join(root, "tasks", TASK, "solutions", condition, name), {
        recursive: true,
      })
    }
  }
  after(() => rmSync(root, { recursive: true, force: true }))

  it("exits 2 on a --require that names no condition", async () => {
    const r = await gate("--require", "v5")
    assert.equal(r.status, 2)
    assert.match(r.stderr, /not a condition/)
  })
  it("exits 2 on a --root with no tasks directory", async () => {
    const r = await gate("--root", join(root, "tasks", TASK))
    assert.equal(r.status, 2)
    assert.match(r.stderr, /has no tasks\/ directory/)
  })
  it("fails before scoring anything when a required cell is empty", async () => {
    const r = await gate("--root", root, "--task", TASK, "--require", "v4")
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /^FAIL node-tool\/v4: .*required by --require$/m)
    assert.match(r.stdout, /gate: failed before scoring/)
    assert.doesNotMatch(r.stdout, /^(ok {2}|FAIL) node-tool\/[\w-]+\/[\w-]+: /m)
    assert.doesNotMatch(r.stdout, /solutions behaved as expected/)
  })
})
