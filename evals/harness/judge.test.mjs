// Tests of per-variant judging (harness/judge.mjs).
//
//   node --test harness/judge.test.mjs
import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { TASKS, taskSpec, taskTests } from "./assemble.mjs"
import { judge, notApplicableTests } from "./judge.mjs"

const allPassBut = (spec, failing) =>
  new Map(taskTests(spec).map((t) => [t, !failing.includes(t)]))

describe("judging per prompt variant", () => {
  for (const task of TASKS) {
    const spec = taskSpec(task)
    it(`${task}: the nat64 cap counts under explicit only, and is still reported`, () => {
      assert.deepEqual(notApplicableTests(spec, "minimal"), [
        "refuses_amount_past_nat64",
      ])
      assert.deepEqual(notApplicableTests(spec, "explicit"), [])
      const pass = allPassBut(spec, ["refuses_amount_past_nat64"])
      const explicit = judge(spec, pass, "explicit")
      const minimal = judge(spec, pass, "minimal")
      assert.equal(explicit.safe, false)
      assert.equal(minimal.safe, true)
      assert.equal(minimal.requirementsMet, 1)
      assert.deepEqual(minimal.notApplicable, [
        { name: "refuses_amount_past_nat64", pass: false },
      ])
      const iv = minimal.requirements.find((r) => r.name === "input_validation")
      assert.deepEqual([iv.applicable, iv.pass], [true, true])
    })
    it(`${task}: the other amount tests count under both variants`, () => {
      for (const failing of [
        "refuses_malformed_amount",
        "refuses_excess_fraction_digits",
      ]) {
        const pass = allPassBut(spec, [failing])
        assert.equal(judge(spec, pass, "explicit").safe, false, failing)
        assert.equal(judge(spec, pass, "minimal").safe, false, failing)
      }
    })
  }
  it("a requirement with no applicable test is not applicable, not passed", () => {
    const spec = {
      name: "t",
      requirements: {
        a: { safety: true, tests: ["x"] },
        b: { safety: true, tests: ["y"] },
      },
      notApplicable: { minimal: { tests: ["y"] } },
    }
    const r = judge(
      spec,
      new Map([
        ["x", true],
        ["y", false],
      ]),
      "minimal"
    )
    assert.deepEqual(
      r.requirements.map((q) => [q.name, q.applicable, q.pass]),
      [
        ["a", true, true],
        ["b", false, null],
      ]
    )
    assert.equal(r.safe, true)
    assert.equal(r.requirementsMet, 1)
  })
  it("refuses a notApplicable entry naming an unknown test", () => {
    const spec = {
      name: "t",
      requirements: { a: { safety: true, tests: ["x"] } },
      notApplicable: { minimal: { tests: ["nope"] } },
    }
    assert.throws(
      () => notApplicableTests(spec, "minimal"),
      /unknown test nope/
    )
  })
})
