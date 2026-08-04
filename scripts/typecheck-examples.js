#!/usr/bin/env node
/**
 * Type-checks every workspace example against the locally built @ic-reactor/*
 * packages. Run `pnpm build` first so the example imports resolve to the freshly
 * built dist + type declarations.
 *
 * Usage: node scripts/typecheck-examples.js
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const examplesDir = join(root, "examples")

// icp-reactor-demo is a dfx fullstack app whose frontend pins an old vite-plugin,
// so it builds standalone rather than against the local packages. Skip it here.
const SKIP = new Set(["icp-reactor-demo"])

/** Next.js generates this file during `next build`; create a shim so `tsc` can
 * type-check the app without a full build. */
const NEXT_ENV = `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 */
function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false })
}

const entries = execFileSync("git", ["-C", examplesDir, "ls-files", "-z"], {
  encoding: "utf8",
})
// Discover example projects at BOTH depths, matching pnpm-workspace.yaml's
// `examples/*` and `examples/*/*`. Keying only on the first path segment used to
// drop examples/vite-environment-variables entirely -- it has no top-level
// package.json, so the canonical ic_env injection demo was never type-checked.
const tracked = entries.split("\0").filter(Boolean)
const dirs = [
  ...new Set(
    tracked.flatMap((p) => {
      const parts = p.split("/")
      const candidates = []
      if (parts.length >= 2) candidates.push(parts[0])
      if (parts.length >= 3) candidates.push(`${parts[0]}/${parts[1]}`)
      return candidates
    })
  ),
]
  .filter((name) => existsSync(join(examplesDir, name, "package.json")))
  .filter((name) => !SKIP.has(name.split("/")[0]))
  // A directory that only contains a nested project is a container, not a project.
  .filter((name, _i, all) => {
    const isContainer =
      !name.includes("/") &&
      !existsSync(join(examplesDir, name, "tsconfig.json")) &&
      all.some((other) => other.startsWith(`${name}/`))
    return !isContainer
  })
  .sort()

const failures = []
const skipped = []

for (const name of dirs) {
  const dir = join(examplesDir, name)
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
  const isNext = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next)

  // Pick the project to type-check. Most examples ship a self-contained
  // tsconfig.json with `noEmit`. icp-reactor-demo keeps its app under frontend/.
  let project = dir
  if (!existsSync(join(dir, "tsconfig.json"))) {
    const frontend = join(dir, "frontend")
    if (existsSync(join(frontend, "tsconfig.json"))) {
      project = frontend
    } else {
      // Previously a silent `continue` that still counted toward "All N examples
      // type-check cleanly" -- a project could drop out of coverage unnoticed.
      console.error(`\u274c ${name}: has a package.json but no tsconfig.json`)
      skipped.push(name)
      continue
    }
  }

  if (isNext) {
    const nextEnv = join(project, "next-env.d.ts")
    if (!existsSync(nextEnv)) writeFileSync(nextEnv, NEXT_ENV)
  }

  console.log(`\n\u25b6  Type-checking ${name}`)
  const result = run(
    "pnpm",
    ["exec", "tsc", "--noEmit", "-p", "tsconfig.json"],
    project
  )
  if (result.status !== 0) failures.push(name)
}

if (skipped.length > 0) {
  console.error(
    `\n\u274c Not type-checked (add a tsconfig.json, or add to SKIP with a reason): ${skipped.join(", ")}`
  )
}
if (failures.length > 0) {
  console.error(`\n\u274c Type errors in: ${failures.join(", ")}`)
}
if (failures.length > 0 || skipped.length > 0) process.exit(1)

console.log(
  `\n\u2705 All ${dirs.length - skipped.length} examples type-check cleanly` +
    (SKIP.size > 0 ? ` (skipped by name: ${[...SKIP].join(", ")})` : "")
)
