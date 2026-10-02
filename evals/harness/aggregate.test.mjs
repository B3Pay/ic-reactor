// Tests of the aggregator (harness/aggregate.mjs).
//
//   node --test harness/aggregate.test.mjs
import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  aggregate,
  newcombe,
  pilotReport,
  printSummary,
  wilson,
} from "./aggregate.mjs"

const close = (a, b, eps = 0.0006) => Math.abs(a - b) < eps

const record = (condition, safe, met, extra = {}) => ({
  task: "node-tool",
  model: "model-a",
  condition,
  tscClean: true,
  safe,
  requirementsMet: met,
  requirements: [
    { name: "basic_function", safety: false, pass: met === 1 },
    { name: "no_resend", safety: true, pass: safe },
  ],
  agent: {
    exit: "normal",
    minutes: 10,
    turns: 20,
    tokens: { input: 1000, output: 200 },
    costUsd: 0.5,
  },
  ...extra,
})

describe("intervals", () => {
  it("Wilson matches the textbook value", () => {
    const [l, u] = wilson(3, 6)
    assert.ok(close(l, 0.1876) && close(u, 0.8124), `${l} ${u}`)
  })
  it("Newcombe matches Newcombe (1998), method 10: 56/70 − 48/80", () => {
    const [l, u] = newcombe(56, 70, 48, 80)
    assert.ok(close(l, 0.0524) && close(u, 0.3339), `${l} ${u}`)
  })
})

describe("aggregate", () => {
  const records = [
    record("thin-guide", true, 1),
    record("thin-guide", false, 0.5),
    record("thin-guide", true, 1, { contaminated: true }),
    record("thin-guide", false, 0, { harnessError: "score.mjs exit 2" }),
    record("v4-proto", true, 1),
    record("v4-proto", true, 1),
    record("v4-proto", false, 0.5, { contaminated: true }),
    record("v4-proto", true, 1, { model: "model-b" }),
  ]
  const summary = aggregate(records)

  it("excludes harness errors everywhere and counts them", () => {
    assert.equal(summary.harnessErrors, 1)
    const tg = summary.main.cells.find(
      (c) => c.condition === "thin-guide" && c.model === "model-a"
    )
    assert.equal(tg.harnessErrors, 1)
    assert.equal(tg.runs, 2)
  })
  it("excludes contaminated runs from main and keeps them in intent-to-treat", () => {
    assert.equal(summary.contaminated, 2)
    const main = summary.main.cells.find(
      (c) => c.condition === "v4-proto" && c.model === "model-a"
    )
    const itt = summary.intentToTreat.cells.find(
      (c) => c.condition === "v4-proto" && c.model === "model-a"
    )
    assert.equal(main.runs, 2)
    assert.equal(main.safeRate, 1)
    assert.equal(itt.runs, 3)
    assert.equal(itt.safeRate, 0.667)
    assert.equal(main.contaminated, 1)
  })
  it("never pools models", () => {
    const b = summary.main.cells.filter((c) => c.model === "model-b")
    assert.equal(b.length, 1)
    assert.equal(b[0].runs, 1)
    assert.ok(summary.main.differences.every((d) => d.model === "model-a"))
  })
  it("compares within task and model, with a risk difference and its interval", () => {
    const d = summary.main.differences.find(
      (x) => x.comparison === "v4-proto - thin-guide"
    )
    assert.equal(d.safeRateDiff, 0.5)
    assert.equal(d.safeRateDiffCI95.length, 2)
    assert.ok(d.safeRateDiffCI95[0] < 0.5 && d.safeRateDiffCI95[1] > 0.5)
  })
})

describe("pilot report", () => {
  it("reports variance, cost, ceiling warnings and sample sizes", () => {
    const records = [
      ...Array.from({ length: 5 }, () => record("v4-proto", true, 1)),
      ...Array.from({ length: 5 }, (_, i) =>
        record("thin-guide", i < 3, i < 3 ? 1 : 0.5)
      ),
    ]
    const report = pilotReport(records, { margin: 0.1 })
    const v4 = report.cells.find((c) => c.condition === "v4-proto")
    assert.ok(v4.warnings.some((w) => w.startsWith("ceiling")))
    assert.equal(v4.minutes.mean, 10)
    assert.equal(v4.tokens.mean, 1200)
    const tg = report.cells.find((c) => c.condition === "thin-guide")
    assert.equal(tg.safeRate, 0.6)
    assert.equal(tg.requirementsMetVariance, 0.075)
    const s = report.sampleSizes.find(
      (x) => x.comparison === "v4-proto - thin-guide"
    )
    // centre 0.8, p1 0.85, p2 0.75: (1.96+0.84)^2 (0.1275+0.1875)/0.01 ≈ 248
    assert.ok(
      s.runsPerCellForSafeRate > 240 && s.runsPerCellForSafeRate < 255,
      String(s.runsPerCellForSafeRate)
    )
  })
})

describe("effort levels", () => {
  it("are never pooled, and compared only within one level", () => {
    const records = [
      record("v4-proto", true, 1, { effort: "low" }),
      record("thin-guide", false, 0.5, { effort: "low" }),
      record("v4-proto", true, 1, { effort: "high" }),
    ]
    const summary = aggregate(records)
    const v4 = summary.main.cells.filter((c) => c.condition === "v4-proto")
    assert.deepEqual(v4.map((c) => c.effort).sort(), ["high", "low"])
    assert.ok(v4.every((c) => c.runs === 1))
    assert.deepEqual(summary.effort, { low: 2, high: 1 })
    assert.deepEqual(
      summary.main.differences.map((d) => `${d.effort} ${d.comparison}`),
      ["low v4-proto - thin-guide"]
    )
  })
})

describe("prompt variants", () => {
  it("are never pooled, and compared only within one variant", () => {
    const records = [
      record("v4-proto", true, 1, { prompt: "minimal" }),
      record("thin-guide", false, 0.5, { prompt: "minimal" }),
      record("v4-proto", true, 1, { prompt: "explicit" }),
      // A record from before the variants existed is explicit.
      record("thin-guide", true, 1),
    ]
    const summary = aggregate(records)
    const v4 = summary.main.cells.filter((c) => c.condition === "v4-proto")
    assert.deepEqual(v4.map((c) => c.prompt).sort(), ["explicit", "minimal"])
    assert.ok(v4.every((c) => c.runs === 1))
    assert.deepEqual(summary.prompt, { minimal: 2, explicit: 2 })
    assert.deepEqual(
      summary.main.differences
        .map((d) => `${d.prompt} ${d.comparison} ${d.safeRateDiff}`)
        .sort(),
      ["explicit v4-proto - thin-guide 0", "minimal v4-proto - thin-guide 1"]
    )
    const pilot = pilotReport(records, { margin: 0.15 })
    assert.deepEqual(pilot.sampleSizes.map((s) => s.prompt).sort(), [
      "explicit",
      "minimal",
    ])
  })
})

describe("not-applicable tests", () => {
  it("count toward nothing and are listed per variant with observed results", () => {
    const na = (pass) => ({
      prompt: "minimal",
      notApplicable: [{ name: "refuses_amount_past_nat64", pass }],
      requirements: [
        { name: "basic_function", safety: false, pass: true, applicable: true },
        { name: "only_na", safety: true, pass: null, applicable: false },
      ],
    })
    const records = [
      record("v4-proto", true, 1, na(false)),
      record("v4-proto", true, 1, na(true)),
      record("thin-guide", true, 1, { prompt: "explicit" }),
    ]
    const summary = aggregate(records)
    assert.deepEqual(summary.notApplicable, {
      minimal: {
        "node-tool": { refuses_amount_past_nat64: { passed: 1, n: 2 } },
      },
    })
    const cell = summary.main.cells.find((c) => c.prompt === "minimal")
    assert.deepEqual(cell.notApplicable, {
      refuses_amount_past_nat64: { passed: 1, n: 2 },
    })
    assert.equal(cell.fullPassRate, 1)
    assert.deepEqual(Object.keys(cell.perRequirement), ["basic_function"])
    let out = ""
    printSummary(summary, (s) => (out += s))
    assert.match(
      out,
      /not applicable under --prompt minimal, node-tool .*refuses_amount_past_nat64 1\/2/
    )
  })
})

describe("the v4 gate (PREREGISTRATION.md, Addendum 3)", () => {
  it("compares v4 with thin-guide in the main and the intent-to-treat result", () => {
    const minimal = (extra = {}) => ({ prompt: "minimal", ...extra })
    const records = [
      ...Array.from({ length: 5 }, () => record("v4", true, 1, minimal())),
      ...Array.from({ length: 5 }, (_, i) =>
        record("thin-guide", i < 4, i < 4 ? 1 : 0.5, minimal())
      ),
      record("v4", false, 0.5, minimal({ contaminated: true })),
    ]
    const summary = aggregate(records)
    const diff = (result) =>
      result.differences.find((d) => d.comparison === "v4 - thin-guide")
    assert.equal(diff(summary.main).safeRateDiff, 0.2)
    // 5/6 - 4/5 with the contaminated run kept.
    assert.equal(diff(summary.intentToTreat).safeRateDiff, 0.033)
    assert.equal(diff(summary.main).safeRateDiffCI95.length, 2)
  })
})
