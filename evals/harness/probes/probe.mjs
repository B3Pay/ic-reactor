#!/usr/bin/env node
// Diagnostic, not part of scoring: runs the amount probe (per input: refused,
// thrown, or sent — and with which base units) against stored solutions.
//
//   node harness/probes/probe.mjs <results dir>      every run in a batch
//   node harness/probes/probe.mjs --task t --condition c --solution <dir>
//
// Prints one JSON object per solution: { task, condition, run, inputs: [...] }.
// Assembles each solution exactly as score.mjs does (starter, solution over
// it, protected files restored, the condition's node_modules), in a private
// 0700 directory, and runs only the probe file.
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import {
  EVALS,
  assembleStarter,
  conditionNodeModules,
  taskSpec,
} from "../assemble.mjs"

const SKIP = new Set(["node_modules", ".git", "dist", ".hidden", ".vitest"])

export function probe({ task, condition, solution }) {
  const spec = taskSpec(task)
  const nodeModules = conditionNodeModules(condition)
  const base = join(tmpdir(), "ic-reactor-evals-score")
  mkdirSync(base, { recursive: true, mode: 0o700 })
  chmodSync(base, 0o700)
  const work = mkdtempSync(join(base, `probe-${task}-${condition}-`))
  try {
    assembleStarter({ task, condition, dest: work })
    cpSync(resolve(solution), work, {
      recursive: true,
      filter: (src) => !SKIP.has(basename(src)),
    })
    for (const file of spec.protected) {
      cpSync(join(EVALS, "tasks", task, "starter", file), join(work, file))
    }
    symlinkSync(nodeModules, join(work, "node_modules"), "dir")
    const dir = join(work, ".hidden")
    mkdirSync(dir)
    cpSync(
      join(EVALS, "harness", "probes", `${task}.probe.ts`),
      join(dir, `${task}.probe.ts`)
    )
    const out = join(dir, "probe.jsonl")
    writeFileSync(out, "")
    writeFileSync(
      join(dir, "vitest.config.mjs"),
      `export default {
  root: ${JSON.stringify(work)},
  cacheDir: ${JSON.stringify(join(dir, ".vite"))},
  resolve: {
    alias: [{ find: /^#harness\\/(.*)$/, replacement: ${JSON.stringify(join(EVALS, "harness"))} + "/$1" }],
  },
  test: {
    include: [".hidden/*.probe.ts"],
    environment: ${JSON.stringify(spec.environment)},
    testTimeout: 180000,
    watch: false,
  },
}
`
    )
    const r = spawnSync(
      process.execPath,
      [
        join(nodeModules, "vitest", "vitest.mjs"),
        "run",
        "--config",
        join(dir, "vitest.config.mjs"),
      ],
      {
        cwd: work,
        encoding: "utf8",
        timeout: 300_000,
        env: { ...process.env, CI: "1", NO_COLOR: "1", PROBE_OUT: out },
      }
    )
    const inputs = readFileSync(out, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    if (inputs.length === 0) {
      throw new Error(
        `probe produced nothing:\n${(r.stdout + r.stderr).slice(-3000)}`
      )
    }
    return inputs
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function runsOf(dir) {
  const out = []
  for (const task of readdirSync(dir)) {
    const t = join(dir, task)
    if (!existsSync(join(EVALS, "tasks", task))) continue
    for (const condition of readdirSync(t)) {
      for (const run of readdirSync(join(t, condition))) {
        const solution = join(t, condition, run, "solution")
        if (existsSync(solution)) out.push({ task, condition, run, solution })
      }
    }
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  let targets
  if (argv[0] && !argv[0].startsWith("--")) targets = runsOf(resolve(argv[0]))
  else {
    const get = (f) => argv[argv.indexOf(f) + 1]
    targets = [
      {
        task: get("--task"),
        condition: get("--condition"),
        run: "-",
        solution: get("--solution"),
      },
    ]
  }
  for (const t of targets) {
    const inputs = probe(t)
    process.stdout.write(
      JSON.stringify({
        task: t.task,
        condition: t.condition,
        run: t.run,
        inputs,
      }) + "\n"
    )
  }
}
