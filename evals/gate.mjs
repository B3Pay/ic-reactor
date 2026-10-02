#!/usr/bin/env node
// Evidence that the hidden tests discriminate: scores every reference
// solution (each must pass every test with a clean tsc) and every faulty
// solution (each must type-check and fail exactly the tests its meta.json
// names — no fewer, no more). A faulty solution whose meta.json has
// `safe: { <prompt variant>: boolean }` must also be judged safe or unsafe
// accordingly under that variant (harness/judge.mjs: tests task.json marks
// not applicable under a variant count toward nothing there).
//
//   node evals/gate.mjs [--task <task>] [--jobs <n>]
//
// Prints one line per solution and a summary; exits 1 if any expectation is
// not met, 2 on a harness error.
import { spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  EVALS,
  CONDITIONS,
  TASKS,
  readJson,
  taskSpec,
} from "./harness/assemble.mjs"
import { judge } from "./harness/judge.mjs"

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const tasks = opt("task") ? [opt("task")] : TASKS
const jobs = Number(opt("jobs", "3"))

const cases = []
const skipped = []
for (const task of tasks) {
  for (const condition of CONDITIONS) {
    // Every reference-like solution: `reference`, `reference-module-scope`, …
    const root = join(EVALS, "tasks", task, "solutions", condition)
    const references = existsSync(root)
      ? readdirSync(root).filter((name) => name.startsWith("reference"))
      : []
    // A condition can exist before its solutions do (v4 until its references
    // are ported): it is skipped, and said so, rather than failing the gate.
    if (references.length === 0) skipped.push(`${task}/${condition}`)
    for (const name of references.sort()) {
      cases.push({
        task,
        condition,
        name,
        dir: join(root, name),
        expectFail: [],
      })
    }
  }
  const faulty = join(EVALS, "tasks", task, "faulty")
  for (const name of existsSync(faulty) ? readdirSync(faulty).sort() : []) {
    const meta = readJson(join(faulty, name, "meta.json"))
    cases.push({
      task,
      condition: meta.condition,
      name,
      dir: join(faulty, name),
      expectFail: meta.expectFail,
      expectSafe: meta.safe ?? {},
      bug: meta.bug,
    })
  }
}

function score(c) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        join(EVALS, "score.mjs"),
        "--task",
        c.task,
        "--condition",
        c.condition,
        "--solution",
        c.dir,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    )
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => resolve({ code, out, err }))
  })
}

for (const cell of skipped) {
  process.stdout.write(`skip ${cell}: no reference solutions yet\n`)
}

const results = []
let next = 0
async function worker() {
  while (next < cases.length) {
    const c = cases[next++]
    const { code, out, err } = await score(c)
    if (code !== 0) {
      results.push({
        ...c,
        ok: false,
        line: `HARNESS ERROR (exit ${code}): ${err.trim().split("\n")[0]}`,
      })
      continue
    }
    const r = JSON.parse(out)
    const failed = r.tests.filter((t) => !t.pass).map((t) => t.name)
    const want = [...c.expectFail].sort()
    const passByName = new Map(r.tests.map((t) => [t.name, t.pass]))
    const safeWrong = Object.entries(c.expectSafe ?? {})
      .filter(
        ([variant, safe]) =>
          judge(taskSpec(c.task), passByName, variant).safe !== safe
      )
      .map(([variant, safe]) => `${variant}: expected safe ${safe}`)
    const ok =
      r.tscClean &&
      safeWrong.length === 0 &&
      JSON.stringify([...failed].sort()) === JSON.stringify(want)
    results.push({
      ...c,
      ok,
      score: r,
      line:
        `${ok ? "ok  " : "FAIL"} ${c.task}/${c.condition}/${c.name}: tsc ${r.tscClean ? "clean" : "ERRORS"}, ` +
        `passRate ${r.passRate}, safe ${r.safe}, failed [${failed.join(", ")}]` +
        (Object.keys(c.expectSafe ?? {}).length
          ? `; safe by variant ${JSON.stringify(
              Object.fromEntries(
                Object.keys(c.expectSafe).map((v) => [
                  v,
                  judge(taskSpec(c.task), passByName, v).safe,
                ])
              )
            )}`
          : "") +
        (ok
          ? ""
          : ` — expected [${want.join(", ")}]` +
            (safeWrong.length ? `; ${safeWrong.join("; ")}` : "")),
    })
    process.stdout.write(results.at(-1).line + "\n")
  }
}
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker))

const bad = results.filter((r) => !r.ok)
process.stdout.write(
  `\ngate: ${results.length - bad.length}/${results.length} solutions behaved as expected` +
    ` (${results.filter((r) => r.name.startsWith("reference")).length} references, ` +
    `${results.filter((r) => !r.name.startsWith("reference")).length} faulty)` +
    (skipped.length > 0
      ? `; skipped, no reference solutions yet: ${skipped.join(", ")}`
      : "") +
    "\n"
)
if (bad.some((r) => r.line.startsWith("HARNESS"))) process.exit(2)
process.exit(bad.length === 0 ? 0 : 1)
