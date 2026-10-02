// What gate.mjs scores, and which of the cells it finds empty it may skip.
// Kept apart from the scoring so the skip rule can be tested without scoring
// anything (harness/gate-plan.test.mjs).
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  CONDITIONS,
  DEFAULT_CONDITIONS,
  EVALS,
  TASKS,
  readJson,
} from "./assemble.mjs"

/**
 * The gate's plan for `tasks`:
 *
 * - `cases`: one per reference-like solution
 *   (`tasks/<task>/solutions/<condition>/reference*`, expected to pass every
 *   test) and one per faulty solution (`tasks/<task>/faulty/<name>`, whose
 *   `meta.json` names its condition and the tests it must fail);
 * - `skipped`: every cell (task × condition) with no reference solution, as
 *   `{ cell, reasons }`; `reasons` says why the cell may NOT be skipped and is
 *   empty when it may;
 * - `blocked`: the skipped cells with a reason, which fail the gate.
 *
 * A cell may not be skipped when its condition is pre-registered
 * (`DEFAULT_CONDITIONS`: the pilots' 45 solutions include every one of their
 * cells, so an empty one is a deletion), when its condition is in `require`
 * (`node gate.mjs --require v4`, Addendum 3's pass rule 2), or when its task
 * holds faulty solutions of that condition (each is its reference with one
 * change, so finding one without a reference means a port left half done).
 * Only the cells of a condition not yet ported, which nothing names, are
 * skipped, and gate.mjs prints each one.
 *
 * Throws on a task or a `require` entry the harness does not know.
 */
export function gatePlan({ tasks = TASKS, require = [], root = EVALS } = {}) {
  for (const task of tasks) {
    if (!TASKS.includes(task)) {
      throw new Error(
        `--task ${JSON.stringify(task)}: not a task (${TASKS.join(", ")})`
      )
    }
  }
  for (const condition of require) {
    if (!CONDITIONS.includes(condition)) {
      throw new Error(
        `--require ${JSON.stringify(condition)}: not a condition (${CONDITIONS.join(", ")})`
      )
    }
  }
  const cases = []
  const skipped = []
  for (const task of tasks) {
    const faultyRoot = join(root, "tasks", task, "faulty")
    const faulty = (existsSync(faultyRoot) ? readdirSync(faultyRoot) : [])
      .sort()
      .map((name) => {
        const meta = readJson(join(faultyRoot, name, "meta.json"))
        return {
          task,
          condition: meta.condition,
          name,
          dir: join(faultyRoot, name),
          expectFail: meta.expectFail,
          expectSafe: meta.safe ?? {},
          bug: meta.bug,
        }
      })
    for (const condition of CONDITIONS) {
      // Every reference-like solution: `reference`, `reference-module-scope`, …
      const solutions = join(root, "tasks", task, "solutions", condition)
      const references = existsSync(solutions)
        ? readdirSync(solutions).filter((name) => name.startsWith("reference"))
        : []
      for (const name of references.sort()) {
        cases.push({
          task,
          condition,
          name,
          dir: join(solutions, name),
          expectFail: [],
        })
      }
      if (references.length > 0) continue
      const reasons = []
      if (DEFAULT_CONDITIONS.includes(condition))
        reasons.push("a pre-registered condition")
      if (require.includes(condition)) reasons.push("required by --require")
      const orphans = faulty
        .filter((c) => c.condition === condition)
        .map((c) => c.name)
      if (orphans.length > 0)
        reasons.push(`its faulty solutions need one: ${orphans.join(", ")}`)
      skipped.push({ cell: `${task}/${condition}`, reasons })
    }
    cases.push(...faulty)
  }
  return {
    cases,
    skipped,
    blocked: skipped.filter((s) => s.reasons.length > 0),
  }
}
