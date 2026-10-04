// Aggregation of per-run records into per-cell statistics.
//
// A record is score.mjs's JSON plus what the driver adds: model, run, agent
// {exit, turns, tokens, costUsd, minutes}, contaminated, harnessError.
//
// Cells are task × model × effort × prompt variant × condition: models,
// effort levels and prompt variants are never pooled, and comparisons are only
// ever made within one task, model, effort level and prompt variant. A record
// without `prompt` predates the variants and is `explicit`.
//
// Primary metric: the fraction of runs with zero safety-requirement
// violations (`safe`, binary per run), with a Wilson 95% interval per cell and
// a Newcombe hybrid-score 95% interval for the risk difference between two
// conditions. Secondary: mean fraction of requirements met (bootstrap 95%
// CI), and its difference. Reported alongside: tsc-clean rate, full-pass rate,
// per-requirement pass rates.
//
// Tests task.json marks not applicable under a prompt variant (score.mjs
// `notApplicable`) count toward nothing; they are listed per variant, with
// their observed results, never silently dropped.
//
// One exception to "within one task": `pooled` reports each comparison with
// both tasks pooled (safe runs and runs summed per condition, over the tasks
// where both conditions have usable runs), still within one model, effort
// level and prompt variant. It decides nothing unless a pre-registration says
// so (PREREGISTRATION.md, Addendum 4, pass rule alternative A).
//
// Harness errors are excluded from every statistic and counted (the driver
// retries them). Contaminated runs (the leak audit found a successful read
// outside the run) are excluded from the main result and kept in the
// intent-to-treat result; both are reported, with the counts.

/**
 * Pairs compared per task and model: the real packages against the guide
 * they were built from (Addendum 3, the 4.0.0-beta.1 gate), the original
 * headline, the guide's effect, the rest.
 */
export const COMPARISONS = [
  ["v4", "thin-guide"],
  ["v4-proto", "thin-guide"],
  ["thin-guide", "thin"],
  ["v4-proto", "thin"],
  ["v4-proto", "v3"],
  ["thin-guide", "v3"],
  ["thin", "v3"],
]

export const round = (x) =>
  Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x

// ---------------------------------------------------------------- statistics

const Z95 = 1.959963984540054

export function wilson(successes, n, z = Z95) {
  if (n === 0) return [0, 1]
  const p = successes / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

/**
 * Newcombe's hybrid score interval (method 10, Newcombe 1998) for p1 − p2,
 * built from the two Wilson intervals.
 */
export function newcombe(x1, n1, x2, n2, z = Z95) {
  if (n1 === 0 || n2 === 0) return [NaN, NaN]
  const p1 = x1 / n1
  const p2 = x2 / n2
  const [l1, u1] = wilson(x1, n1, z)
  const [l2, u2] = wilson(x2, n2, z)
  const d = p1 - p2
  return [
    d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
    d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2),
  ]
}

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN

export function variance(xs) {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)
}

const median = (xs) => {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Percentile bootstrap 95% CI of mean(a), or of mean(a) − mean(b). */
export function bootstrap(a, b, iterations = 10_000, seed = 42) {
  if (a.length === 0 || (b !== undefined && b.length === 0)) return [NaN, NaN]
  const random = rng(seed)
  const resampledMean = (xs) => {
    let sum = 0
    for (let i = 0; i < xs.length; i += 1)
      sum += xs[Math.floor(random() * xs.length)]
    return sum / xs.length
  }
  const stats = []
  for (let i = 0; i < iterations; i += 1) {
    stats.push(resampledMean(a) - (b === undefined ? 0 : resampledMean(b)))
  }
  stats.sort((x, y) => x - y)
  return [
    stats[Math.floor(0.025 * iterations)],
    stats[Math.floor(0.975 * iterations) - 1],
  ]
}

// ---------------------------------------------------------------- aggregation

/** What a cell is, apart from its condition; comparisons stay inside one. */
const scopeOf = (r) => ({
  task: r.task,
  model: r.model ?? "unknown",
  effort: r.effort ?? "default",
  prompt: r.prompt ?? "explicit",
})
const scopeKey = (c) => `${c.task}|${c.model}|${c.effort}|${c.prompt}`
const cellKey = (c) => `${scopeKey(c)}|${c.condition}`
const scopeLabel = (c) => `${c.task}/${c.model}/${c.effort}/${c.prompt}`

function group(records) {
  const cells = new Map()
  for (const r of records) {
    const cell = { ...scopeOf(r), condition: r.condition }
    const key = cellKey(cell)
    if (!cells.has(key)) cells.set(key, { ...cell, all: [] })
    cells.get(key).all.push(r)
  }
  return [...cells.values()]
}

/** Not-applicable tests of these runs → { test: { passed, n } } (observed only). */
function notApplicableOf(runs) {
  const out = {}
  for (const r of runs) {
    for (const t of r.notApplicable ?? []) {
      out[t.name] ??= { passed: 0, n: 0 }
      out[t.name].passed += t.pass ? 1 : 0
      out[t.name].n += 1
    }
  }
  return out
}

function describeCell(cell, runs) {
  const n = runs.length
  const safe = runs.filter((r) => r.safe).length
  const met = runs.map((r) => r.requirementsMet)
  const full = runs.filter((r) =>
    r.requirements?.every((q) => q.applicable === false || q.pass)
  ).length
  const tsc = runs.filter((r) => r.tscClean).length
  const perRequirement = {}
  for (const r of runs) {
    for (const q of r.requirements ?? []) {
      if (q.applicable === false) continue
      perRequirement[q.name] ??= { pass: 0, n: 0, safety: q.safety }
      perRequirement[q.name].pass += q.pass ? 1 : 0
      perRequirement[q.name].n += 1
    }
  }
  return {
    task: cell.task,
    model: cell.model,
    effort: cell.effort,
    prompt: cell.prompt,
    condition: cell.condition,
    runs: n,
    contaminated: cell.all.filter((r) => r.contaminated && !r.harnessError)
      .length,
    harnessErrors: cell.all.filter((r) => r.harnessError).length,
    safeRate: n ? round(safe / n) : null,
    safeRateCI95: wilson(safe, n).map(round),
    meanRequirementsMet: round(mean(met)),
    meanRequirementsMetCI95: bootstrap(met).map(round),
    fullPassRate: n ? round(full / n) : null,
    fullPassRateCI95: wilson(full, n).map(round),
    tscCleanRate: n ? round(tsc / n) : null,
    perRequirement: Object.fromEntries(
      Object.entries(perRequirement).map(([name, { pass, n: m, safety }]) => [
        name,
        {
          safety,
          passed: pass,
          n: m,
          passRate: round(pass / m),
          ci95: wilson(pass, m).map(round),
        },
      ])
    ),
    notApplicable: notApplicableOf(runs),
  }
}

function compare(cells) {
  const out = []
  const byKey = new Map(cells.map((c) => [cellKey(c), c]))
  const scopes = new Map(cells.map((c) => [scopeKey(c), scopeOf(c)]))
  for (const [key, scope] of scopes) {
    for (const [a, b] of COMPARISONS) {
      const A = byKey.get(`${key}|${a}`)
      const B = byKey.get(`${key}|${b}`)
      if (!A || !B || A.runs.length === 0 || B.runs.length === 0) continue
      const sa = A.runs.filter((r) => r.safe).length
      const sb = B.runs.filter((r) => r.safe).length
      const ma = A.runs.map((r) => r.requirementsMet)
      const mb = B.runs.map((r) => r.requirementsMet)
      out.push({
        ...scope,
        comparison: `${a} - ${b}`,
        safeRateDiff: round(sa / A.runs.length - sb / B.runs.length),
        safeRateDiffCI95: newcombe(sa, A.runs.length, sb, B.runs.length).map(
          round
        ),
        meanRequirementsMetDiff: round(mean(ma) - mean(mb)),
        meanRequirementsMetDiffCI95: bootstrap(ma, mb).map(round),
      })
    }
  }
  return out
}

/**
 * Each comparison pooled over tasks, per model × effort × prompt variant:
 * a condition's safe runs and runs summed over the tasks where both
 * conditions have usable runs (so a run weighs the same whichever task it
 * belongs to), with Newcombe's interval for the pooled difference. Only
 * where two or more tasks pool.
 */
function comparePooled(cells) {
  const out = []
  const scopeOfPool = (c) => ({
    model: c.model,
    effort: c.effort,
    prompt: c.prompt,
  })
  const poolKey = (c) => `${c.model}|${c.effort}|${c.prompt}`
  const pools = new Map(cells.map((c) => [poolKey(c), scopeOfPool(c)]))
  const byKey = new Map(cells.map((c) => [cellKey(c), c]))
  for (const [key, scope] of pools) {
    const tasks = [
      ...new Set(cells.filter((c) => poolKey(c) === key).map((c) => c.task)),
    ].sort()
    for (const [a, b] of COMPARISONS) {
      const pairs = tasks
        .map((task) => {
          const at = (condition) =>
            byKey.get(cellKey({ ...scope, task, condition }))
          return { task, A: at(a), B: at(b) }
        })
        .filter(({ A, B }) => A?.runs.length > 0 && B?.runs.length > 0)
      if (pairs.length < 2) continue
      const count = (side) => {
        const runs = pairs.flatMap((p) => p[side].runs)
        return { safe: runs.filter((r) => r.safe).length, runs: runs.length }
      }
      const [ca, cb] = [count("A"), count("B")]
      out.push({
        ...scope,
        tasks: pairs.map((p) => p.task),
        comparison: `${a} - ${b}`,
        counts: { [a]: ca, [b]: cb },
        safeRateDiff: round(ca.safe / ca.runs - cb.safe / cb.runs),
        safeRateDiffCI95: newcombe(ca.safe, ca.runs, cb.safe, cb.runs).map(
          round
        ),
      })
    }
  }
  return out
}

function summarise(records, { keepContaminated }) {
  const groups = group(records)
  const cells = groups.map((cell) => {
    const runs = cell.all.filter(
      (r) => !r.harnessError && (keepContaminated || !r.contaminated)
    )
    return { ...describeCell(cell, runs), _runs: runs }
  })
  const withRuns = cells.map((c) => ({
    ...scopeOf(c),
    condition: c.condition,
    runs: c._runs,
  }))
  return {
    cells: cells.map(({ _runs, ...c }) => c),
    differences: compare(withRuns),
    pooled: comparePooled(withRuns),
  }
}

const countBy = (records, key) =>
  records.reduce((acc, r) => {
    const k = key(r)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

function notApplicableByVariant(records) {
  const out = {}
  for (const r of records) {
    for (const t of r.notApplicable ?? []) {
      const slot = ((out[r.prompt ?? "explicit"] ??= {})[r.task] ??= {})
      slot[t.name] ??= { passed: 0, n: 0 }
      slot[t.name].passed += t.pass ? 1 : 0
      slot[t.name].n += 1
    }
  }
  return out
}

export function aggregate(records) {
  const valid = records.filter((r) => !r.harnessError)
  return {
    runs: records.length,
    // How agents authenticated (oauth = a Claude subscription, whose rate
    // limits can throttle a batch; api_key = API billing).
    auth: countBy(records, (r) => r.auth ?? "unknown"),
    // Effort levels are never pooled: each is its own set of cells.
    effort: countBy(records, (r) => r.effort ?? "default"),
    // Prompt variants are never pooled either.
    prompt: countBy(records, (r) => r.prompt ?? "explicit"),
    // Per variant and task: the tests scored as not applicable (task.json
    // `notApplicable`), and how often they passed anyway (informational).
    notApplicable: notApplicableByVariant(valid),
    harnessErrors: records.length - valid.length,
    // rate_limited: the account's usage/rate limit, not the solution.
    harnessErrorKinds: countBy(
      records.filter((r) => r.harnessError),
      (r) => r.harnessKind ?? "harness"
    ),
    contaminated: valid.filter((r) => r.contaminated).length,
    main: summarise(records, { keepContaminated: false }),
    intentToTreat: summarise(records, { keepContaminated: true }),
  }
}

// ---------------------------------------------------------------- pilot

const Z_POWER = { 0.8: 0.8416212335729143, 0.9: 1.2815515655446004 }

/**
 * What a pilot tells the owner before the matrix: observed variance, cost per
 * run, ceiling/floor warnings, and the runs per cell needed to detect
 * `margin` in the primary metric (and in mean requirements met) at α = 0.05,
 * two-sided, with `power`.
 */
export function pilotReport(records, { margin = 0.1, power = 0.8 } = {}) {
  const za = Z95
  const zb = Z_POWER[power] ?? Z_POWER[0.8]
  const usable = records.filter((r) => !r.harnessError && !r.contaminated)
  const cells = group(usable).map((cell) => {
    const runs = cell.all
    const met = runs.map((r) => r.requirementsMet)
    const safe = runs.filter((r) => r.safe).length / runs.length
    const agent = runs.map((r) => r.agent ?? {})
    const tokens = agent.map(
      (a) => (a.tokens?.input ?? 0) + (a.tokens?.output ?? 0)
    )
    const warnings = []
    if (safe >= 0.9 || mean(met) >= 0.95)
      warnings.push("ceiling: little room to show a gain")
    if (safe <= 0.1 || mean(met) <= 0.1)
      warnings.push("floor: the task may be too hard for this model")
    return {
      task: cell.task,
      model: cell.model,
      effort: cell.effort,
      prompt: cell.prompt,
      condition: cell.condition,
      runs: runs.length,
      safeRate: round(safe),
      safeRateVariance: round(safe * (1 - safe)),
      requirementsMetMean: round(mean(met)),
      requirementsMetVariance: round(variance(met)),
      minutes: {
        mean: round(mean(agent.map((a) => a.minutes ?? NaN))),
        median: round(median(agent.map((a) => a.minutes ?? NaN))),
      },
      turns: {
        mean: round(mean(agent.map((a) => a.turns ?? NaN))),
        median: round(median(agent.map((a) => a.turns ?? NaN))),
      },
      tokens: { mean: round(mean(tokens)), median: round(median(tokens)) },
      costUsd: { mean: round(mean(agent.map((a) => a.costUsd ?? NaN))) },
      exits: Object.fromEntries(
        [...new Set(agent.map((a) => a.exit ?? "unknown"))].map((e) => [
          e,
          agent.filter((a) => (a.exit ?? "unknown") === e).length,
        ])
      ),
      warnings,
    }
  })
  const byKey = new Map(cells.map((c) => [cellKey(c), c]))
  const clamp = (p) => Math.min(0.95, Math.max(0.05, p))
  const sampleSizes = []
  const scopes = new Map(cells.map((c) => [scopeKey(c), scopeOf(c)]))
  for (const [key, scope] of scopes) {
    for (const [a, b] of COMPARISONS) {
      const A = byKey.get(`${key}|${a}`)
      const B = byKey.get(`${key}|${b}`)
      if (!A || !B) continue
      // Primary: a risk difference of `margin` around the observed rates.
      const centre = (A.safeRate + B.safeRate) / 2
      const p1 = clamp(centre + margin / 2)
      const p2 = clamp(centre - margin / 2)
      const nSafe = Math.ceil(
        ((za + zb) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / margin ** 2
      )
      // Secondary: a difference of `margin` in mean requirements met.
      const pooled = mean(
        [A.requirementsMetVariance, B.requirementsMetVariance].filter(
          Number.isFinite
        )
      )
      const nMet = Number.isFinite(pooled)
        ? Math.ceil(
            (2 * (za + zb) ** 2 * Math.max(pooled, 0.0025)) / margin ** 2
          )
        : null
      sampleSizes.push({
        ...scope,
        comparison: `${a} - ${b}`,
        margin,
        power,
        runsPerCellForSafeRate: nSafe,
        runsPerCellForRequirementsMet: nMet,
      })
    }
  }
  return { margin, power, cells, sampleSizes }
}

// ---------------------------------------------------------------- printing

const fmt = (ci) => `[${ci.join(", ")}]`

export function printSummary(summary, write = (s) => process.stdout.write(s)) {
  write(
    `runs ${summary.runs}; auth ${JSON.stringify(summary.auth)}; effort ${JSON.stringify(summary.effort)}; ` +
      `prompt ${JSON.stringify(summary.prompt)}; ` +
      `harness errors excluded ${summary.harnessErrors} ${JSON.stringify(summary.harnessErrorKinds)}; ` +
      `contaminated ${summary.contaminated} (excluded from main, kept in intent-to-treat)\n`
  )
  for (const [variant, tasks] of Object.entries(summary.notApplicable ?? {})) {
    for (const [task, tests] of Object.entries(tasks)) {
      write(
        `not applicable under --prompt ${variant}, ${task} (scored as nothing; observed pass shown): ` +
          Object.entries(tests)
            .map(([name, { passed, n }]) => `${name} ${passed}/${n}`)
            .join(", ") +
          "\n"
      )
    }
  }
  for (const [label, part] of [
    ["main", summary.main],
    ["intent-to-treat", summary.intentToTreat],
  ]) {
    write(`\n== ${label}\n`)
    for (const c of part.cells) {
      write(
        `${scopeLabel(c)}/${c.condition}: n=${c.runs}` +
          (c.runs
            ? ` safe ${c.safeRate} ${fmt(c.safeRateCI95)} met ${c.meanRequirementsMet} ${fmt(c.meanRequirementsMetCI95)}` +
              ` tsc ${c.tscCleanRate} full ${c.fullPassRate}`
            : " (no usable runs)") +
          ` contaminated ${c.contaminated} harness-errors ${c.harnessErrors}\n`
      )
    }
    for (const d of part.differences) {
      write(
        `${scopeLabel(d)}: ${d.comparison}: safe ${d.safeRateDiff} ${fmt(d.safeRateDiffCI95)}` +
          ` met ${d.meanRequirementsMetDiff} ${fmt(d.meanRequirementsMetDiffCI95)}\n`
      )
    }
    for (const d of part.pooled ?? []) {
      write(
        `pooled ${d.tasks.join("+")}/${d.model}/${d.effort}/${d.prompt}: ${d.comparison}: ` +
          `safe ${d.safeRateDiff} ${fmt(d.safeRateDiffCI95)} (` +
          Object.entries(d.counts)
            .map(([c, { safe, runs }]) => `${c} ${safe}/${runs}`)
            .join(", ") +
          ")\n"
      )
    }
  }
}

export function printPilot(report, write = (s) => process.stdout.write(s)) {
  write(
    `pilot: margin ${report.margin}, power ${report.power}, α 0.05 two-sided\n`
  )
  for (const c of report.cells) {
    write(
      `${scopeLabel(c)}/${c.condition}: n=${c.runs} safe ${c.safeRate} (var ${c.safeRateVariance})` +
        ` met ${c.requirementsMetMean} (var ${c.requirementsMetVariance})` +
        ` minutes ${c.minutes.mean}/${c.minutes.median} turns ${c.turns.mean}/${c.turns.median}` +
        ` tokens ${c.tokens.mean} cost $${c.costUsd.mean} exits ${JSON.stringify(c.exits)}` +
        (c.warnings.length ? ` WARN: ${c.warnings.join("; ")}` : "") +
        "\n"
    )
  }
  for (const s of report.sampleSizes) {
    write(
      `${scopeLabel(s)}: ${s.comparison}: ${s.runsPerCellForSafeRate} runs/cell for safe-rate margin ${s.margin}` +
        `; ${s.runsPerCellForRequirementsMet ?? "?"} for requirements-met margin ${s.margin}\n`
    )
  }
}
