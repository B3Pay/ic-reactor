#!/usr/bin/env node
// Scores one solution for one task × condition.
//
//   node evals/score.mjs --task <task> --condition <condition> --solution <dir>
//        [--prompt explicit|minimal] [--keep]
//
// It assembles the starter for the task × condition in a fresh directory
// under a private (0700) scoring directory, lays the solution's files over it
// (node_modules, .git and dist skipped), puts the task's protected files
// back, links the condition's node_modules, runs `tsc --noEmit`, then runs
// the task's hidden tests with vitest, and prints exactly one JSON object:
//
//   { task, condition, prompt, tscClean, tests: [{ name, pass, applicable }],
//     passRate, requirements: [{ name, safety, pass, applicable }],
//     notApplicable: [{ name, pass }], safetyViolations, safe,
//     requirementsMet, details }
//
// A requirement passes when all its applicable tests pass (task.json groups
// them); `safe` is "no applicable safety requirement failed". A test listed
// in task.json `notApplicable[<prompt variant>]` states a rule that variant's
// prompt does not give the agent: it still runs and is reported (under
// `notApplicable`, with its result) but counts toward nothing; a requirement
// left with no applicable test is not applicable either. The driver scores
// only after every agent run of a batch has ended.
//
// It never reads stdin. It exits 0 whenever it produced a score, however bad
// the solution; a non-zero exit (2) means the harness itself failed.
import { spawn } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import {
  EVALS,
  PROMPT_VARIANTS,
  assembleStarter,
  conditionNodeModules,
  conditionSpec,
  taskSpec,
  taskTests,
} from "./harness/assemble.mjs"
import { judge, notApplicableTests } from "./harness/judge.mjs"

const SKIP = new Set(["node_modules", ".git", "dist", ".hidden", ".vitest"])

function parseArgs(argv) {
  const args = { keep: false, prompt: "explicit" }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === "--keep") args.keep = true
    else if (
      flag === "--task" ||
      flag === "--condition" ||
      flag === "--solution" ||
      flag === "--prompt"
    ) {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${flag} needs a value`)
      args[flag.slice(2)] = value
    } else throw new Error(`unknown argument ${flag}`)
  }
  for (const required of ["task", "condition", "solution"]) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  if (!PROMPT_VARIANTS.includes(args.prompt)) {
    throw new Error(`--prompt is one of ${PROMPT_VARIANTS.join(", ")}`)
  }
  return args
}

function run(command, args, options) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs)
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, signal, stdout, stderr })
    })
  })
}

async function score({ task, condition, solution, keep, prompt }) {
  const spec = taskSpec(task)
  notApplicableTests(spec, prompt)
  conditionSpec(condition)
  const solutionDir = resolve(solution)
  if (!existsSync(solutionDir) || !statSync(solutionDir).isDirectory()) {
    throw new Error(`solution ${solutionDir} is not a directory`)
  }
  const nodeModules = conditionNodeModules(condition)
  if (!existsSync(join(nodeModules, "vitest"))) {
    throw new Error(
      `run \`pnpm install\` and \`node setup.mjs\` in ${EVALS} first`
    )
  }

  // A private directory of its own, never the one agent runs live in: the
  // hidden tests are copied into it.
  const base = join(tmpdir(), "ic-reactor-evals-score")
  mkdirSync(base, { recursive: true, mode: 0o700 })
  chmodSync(base, 0o700)
  const work = mkdtempSync(join(base, `${task}-${condition}-`))
  try {
    assembleStarter({ task, condition, dest: work })
    cpSync(solutionDir, work, {
      recursive: true,
      filter: (src) => !SKIP.has(basename(src)),
    })
    for (const file of spec.protected) {
      cpSync(join(EVALS, "tasks", task, "starter", file), join(work, file))
    }
    symlinkSync(nodeModules, join(work, "node_modules"), "dir")

    const tsc = await run(
      process.execPath,
      [
        join(nodeModules, "typescript", "bin", "tsc"),
        "--noEmit",
        "-p",
        "tsconfig.json",
      ],
      { cwd: work, timeoutMs: 180_000 }
    )
    const tscClean = tsc.code === 0

    const hidden = join(work, ".hidden")
    mkdirSync(hidden)
    for (const file of spec.hidden) {
      cpSync(join(EVALS, "tasks", task, file), join(hidden, basename(file)))
    }
    const results = join(hidden, "results.json")
    writeFileSync(
      join(hidden, "vitest.config.mjs"),
      `export default {
  root: ${JSON.stringify(work)},
  // Keep vitest's result cache (it names the hidden test files) out of the
  // condition's node_modules.
  cacheDir: ${JSON.stringify(join(work, ".hidden", ".vite"))},
  resolve: {
    alias: [{ find: /^#harness\\/(.*)$/, replacement: ${JSON.stringify(join(EVALS, "harness"))} + "/$1" }],
  },
  test: {
    include: [".hidden/*.test.ts"],
    environment: ${JSON.stringify(spec.environment)},
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    watch: false,
  },
}
`
    )
    const vitest = await run(
      process.execPath,
      [
        join(nodeModules, "vitest", "vitest.mjs"),
        "run",
        "--config",
        join(hidden, "vitest.config.mjs"),
        "--reporter=json",
        `--outputFile=${results}`,
      ],
      {
        cwd: work,
        timeoutMs: 600_000,
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      }
    )
    if (!existsSync(results)) {
      throw new Error(
        `vitest produced no results (exit ${vitest.code ?? vitest.signal}):\n` +
          (vitest.stderr || vitest.stdout).slice(-4000)
      )
    }
    const report = JSON.parse(readFileSync(results, "utf8"))
    const assertions = new Map()
    const suiteErrors = []
    for (const file of report.testResults ?? []) {
      if (file.status === "failed" && file.message)
        suiteErrors.push(file.message)
      for (const a of file.assertionResults ?? []) assertions.set(a.title, a)
    }
    const names = taskTests(spec)
    const tests = names.map((name) => ({
      name,
      pass: assertions.get(name)?.status === "passed",
    }))
    const unknown = [...assertions.keys()].filter((t) => !names.includes(t))
    if (unknown.length > 0) {
      throw new Error(
        `hidden tests not listed in task.json: ${unknown.join(", ")}`
      )
    }
    const failures = {}
    for (const { name, pass } of tests) {
      if (pass) continue
      const a = assertions.get(name)
      failures[name] = a
        ? (a.failureMessages ?? [])
            .join("\n")
            .split("\n")
            .slice(0, 3)
            .join(" | ")
        : "did not run" +
          (suiteErrors[0] ? `: ${suiteErrors[0].split("\n")[0]}` : "")
    }
    const judged = judge(
      spec,
      new Map(tests.map((t) => [t.name, t.pass])),
      prompt
    )
    return {
      task,
      condition,
      tscClean,
      ...judged,
      details: {
        solution: solutionDir,
        tscErrors: tscClean
          ? []
          : (tsc.stdout + tsc.stderr).split("\n").filter(Boolean).slice(0, 20),
        failures,
        ...(keep ? { workDir: work } : {}),
      },
    }
  } finally {
    if (!keep) rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await score(parseArgs(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result) + "\n")
  } catch (error) {
    process.stderr.write(`score.mjs: harness error: ${error?.stack ?? error}\n`)
    process.exit(2)
  }
}
