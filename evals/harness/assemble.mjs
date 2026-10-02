// Builds the starter project an agent (or the scorer) sees for one
// task × condition, from three layers that never mix:
//
//   tasks/<task>/starter/          identical in every condition
//   conditions/<condition>/starter/ the condition's generated code
//   conditions/<condition>/docs/    the condition's documentation → docs/
//
// plus a package.json listing the condition's dependencies and TASK.md, the
// rendered prompt. Hidden tests, solutions and the harness never go in.
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const EVALS = join(dirname(fileURLToPath(import.meta.url)), "..")
export const TASKS = ["node-tool", "react-wallet"]
/** Every condition the harness knows. */
export const CONDITIONS = ["v3", "thin", "thin-guide", "v4-proto", "v4"]

/**
 * The conditions a batch runs when none is named: the pre-registered matrix
 * (PREREGISTRATION.md). `v4` (the real ic-reactor 4 packages, issue #786)
 * runs only when named, as Addendum 3 does: `--condition v4 --condition
 * thin-guide`.
 */
export const DEFAULT_CONDITIONS = ["v3", "thin", "thin-guide", "v4-proto"]

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

export function taskSpec(task) {
  if (!TASKS.includes(task))
    throw new Error(`unknown task ${JSON.stringify(task)}`)
  return readJson(join(EVALS, "tasks", task, "task.json"))
}

/**
 * Every hidden test name, in requirement order. Each test belongs to exactly
 * one requirement (task.json `requirements`); that is checked here.
 */
export function taskTests(spec) {
  const names = Object.values(spec.requirements).flatMap((r) => r.tests)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  if (dup.length > 0) {
    throw new Error(
      `${spec.name}: tests in more than one requirement: ${dup.join(", ")}`
    )
  }
  return names
}

export function conditionSpec(condition) {
  if (!CONDITIONS.includes(condition)) {
    throw new Error(`unknown condition ${JSON.stringify(condition)}`)
  }
  return readJson(join(EVALS, "conditions", condition, "condition.json"))
}

/**
 * How the agent may check its work, by run mode. `sandboxed`: the agent may
 * run node and vitest (only ever inside an OS sandbox). `tsc-only`: the
 * fallback when no sandbox is available. Identical across conditions.
 */
export const RUN_TEXT = {
  sandboxed:
    "You can run code: `npx vitest run` runs the tests in `test/` against a local\n" +
    "fake Internet Computer replica with an ICRC-1 ledger (`test/support/`; start\n" +
    "from `test/smoke.test.ts`), and `node` is available. Run `npx tsc --noEmit`\n" +
    "before you finish; it must pass. Do not add dependencies.",
  "tsc-only":
    "You can type-check with `npx tsc --noEmit`; you cannot run code. Run it\n" +
    "before you finish; it must pass. Do not add dependencies.",
}

/**
 * The prompt variants. `explicit` states the safety rules the hidden tests
 * check; `minimal` describes the product and its public contract (signatures,
 * result shape, DOM test ids and states) the way a user would, and leaves the
 * safety rules out. Same hidden tests and scoring; never pooled.
 */
export const PROMPT_VARIANTS = ["explicit", "minimal"]

export function promptFile(task, variant = "explicit") {
  if (!PROMPT_VARIANTS.includes(variant)) {
    throw new Error(`unknown prompt variant ${JSON.stringify(variant)}`)
  }
  return join(
    EVALS,
    "tasks",
    task,
    variant === "explicit" ? "prompt.md" : `prompt.${variant}.md`
  )
}

/**
 * The task prompt: identical across conditions but for the {{LIBRARY}} line.
 * {{RUN}} depends on the run mode only; the rest on the prompt variant only.
 */
export function renderPrompt(
  task,
  condition,
  mode = "sandboxed",
  variant = "explicit"
) {
  const file = promptFile(task, variant)
  const template = readFileSync(file, "utf8")
  for (const marker of ["{{LIBRARY}}", "{{RUN}}"]) {
    const lines = template.split("\n").filter((line) => line.includes(marker))
    if (lines.length !== 1 || lines[0].trim() !== marker) {
      throw new Error(
        `${task}/${basename(file)} must hold ${marker} alone on exactly one line`
      )
    }
  }
  if (!(mode in RUN_TEXT)) throw new Error(`unknown run mode ${mode}`)
  return template
    .replace("{{LIBRARY}}", conditionSpec(condition).library)
    .replace("{{RUN}}", RUN_TEXT[mode])
}

/**
 * The condition whose starter, dependencies and node_modules this one uses.
 * A condition with `"base"` in condition.json (thin-guide → thin) differs
 * from its base only in the docs its agent gets: the base's docs plus its own.
 */
export function baseCondition(condition) {
  return conditionSpec(condition).base ?? condition
}

export function conditionNodeModules(condition) {
  return join(EVALS, "conditions", baseCondition(condition), "node_modules")
}

/** The doc directories a condition's agent gets, in the order they are copied. */
export function conditionDocDirs(condition) {
  const dirs = [join(EVALS, "conditions", condition, "docs")]
  const base = baseCondition(condition)
  if (base !== condition) dirs.unshift(join(EVALS, "conditions", base, "docs"))
  return dirs.filter((dir) => existsSync(dir))
}

/** The version of `name` in the condition's node_modules, if it is installed. */
function installedVersion(condition, name) {
  const file = join(conditionNodeModules(condition), name, "package.json")
  return existsSync(file) ? readJson(file).version : undefined
}

export function assembleStarter({
  task,
  condition,
  dest,
  mode = "sandboxed",
  prompt = "explicit",
}) {
  taskSpec(task)
  const spec = conditionSpec(condition)
  mkdirSync(dest, { recursive: true })
  cpSync(join(EVALS, "tasks", task, "starter"), dest, { recursive: true })
  // The public test scaffold: a fake replica with a fake ledger (identical in
  // every condition) under test/support, next to the task's smoke test. Only
  // where the agent may run code; the tsc-only fallback ships no tests.
  if (mode === "sandboxed") {
    cpSync(
      join(EVALS, "harness", "public", "support"),
      join(dest, "test", "support"),
      {
        recursive: true,
      }
    )
  } else {
    rmSync(join(dest, "test"), { recursive: true, force: true })
  }
  const base = baseCondition(condition)
  const overlay = join(EVALS, "conditions", base, "starter")
  if (existsSync(overlay)) cpSync(overlay, dest, { recursive: true })
  for (const docs of conditionDocDirs(condition)) {
    cpSync(docs, join(dest, "docs"), { recursive: true })
  }

  const pkg = readJson(join(EVALS, "conditions", base, "package.json"))
  const deps = { ...pkg.dependencies }
  for (const [name, range] of Object.entries(deps)) {
    // A package built from this repository (v4-proto's prototype, v4's packed
    // packages) shows the version that is installed, as npm would record it.
    if (String(range).startsWith("workspace:"))
      deps[name] =
        installedVersion(condition, name) ?? spec.localVersion ?? "0.0.0"
  }
  writeFileSync(
    join(dest, "package.json"),
    JSON.stringify(
      {
        name: task,
        private: true,
        type: "module",
        scripts: { typecheck: "tsc --noEmit" },
        dependencies: deps,
        devDependencies: pkg.devDependencies,
      },
      null,
      2
    ) + "\n"
  )
  writeFileSync(
    join(dest, "TASK.md"),
    renderPrompt(task, condition, mode, prompt)
  )
  return dest
}
