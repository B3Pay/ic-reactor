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

/**
 * Parse a tsconfig. They are JSONC -- Vite's React template ships `/* Bundler
 * mode *\/` section headers -- so comments and trailing commas are stripped
 * before JSON.parse. String literals are matched first so a `//` inside a path
 * survives.
 *
 * @param {string} file
 */
function readTsconfig(file) {
  const withoutComments = readFileSync(file, "utf8").replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith('"') ? match : " ")
  )
  return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, "$1"))
}

/**
 * A "solution" tsconfig -- `files: []` plus `references` -- delegates all its
 * inputs to the referenced projects. `tsc -p` does NOT follow references, and
 * the empty `files` list suppresses the TS18002/TS18003 "no inputs" errors that
 * would otherwise make an empty project fail loudly, so `tsc --noEmit -p` on
 * one type-checks ZERO files and exits 0 no matter how broken the app is. That
 * is exactly how examples/vite-environment-variables sat in CI for months with
 * generated bindings importing a module that does not exist. Solution files go
 * through `tsc -b`, which does follow references.
 *
 * @param {string} project
 */
function isSolutionTsconfig(project) {
  const config = readTsconfig(join(project, "tsconfig.json"))
  return (
    Array.isArray(config.references) &&
    config.references.length > 0 &&
    Array.isArray(config.files) &&
    config.files.length === 0
  )
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

  let solution
  try {
    solution = isSolutionTsconfig(project)
  } catch (err) {
    console.error(
      `\u274c ${name}: could not parse tsconfig.json: ${err instanceof Error ? err.message : err}`
    )
    skipped.push(name)
    continue
  }

  console.log(`\n\u25b6  Type-checking ${name}${solution ? " (tsc -b)" : ""}`)
  // `--force` because `tsc -b` trusts an existing .tsbuildinfo and would report
  // success without re-reading a single file on a repeat local run.
  const result = solution
    ? run("pnpm", ["exec", "tsc", "-b", "--force", "tsconfig.json"], project)
    : run("pnpm", ["exec", "tsc", "--noEmit", "-p", "tsconfig.json"], project)
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
