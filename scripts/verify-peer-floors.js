#!/usr/bin/env node
/**
 * Do the packages still work with the oldest peers their ranges accept?
 *
 * Every other check installs what the lockfile holds, which is the newest
 * release of each peer. A peer range promises more than that: `^5.90.2`
 * promises 5.90.2. `@ic-reactor/react` declared `@tanstack/react-query ^5.0.0`
 * while it did not compile below 5.89 and failed 20 tests on 5.0.0 (#475), and
 * nothing noticed.
 *
 * This checks the promise. For each package below it adds a throwaway git
 * worktree of HEAD, pins the package's peers to the lowest version each range
 * accepts (through pnpm overrides, so every copy in the graph follows), installs,
 * and runs the package's typecheck and tests there. A range that joins majors,
 * like `@icp-sdk/auth ^8.0.0 || ^10.0.0`, is tested at each major's floor. The
 * worktree is removed afterwards, so your checkout is never touched;
 * uncommitted changes are not part of the run.
 *
 * TypeScript has a floor too, and this runs its check first:
 * verify-typescript-floor.js compiles the declarations of core, react, candid
 * and parser with the oldest TypeScript the docs name. That check reads the
 * declarations `pnpm build` wrote to this checkout, not a worktree of HEAD: a
 * worktree would have to build all four packages again, the parser through Rust
 * and wasm-pack, and CI has just built them here. Locally, run `pnpm build`
 * first.
 *
 * Usage
 *   node scripts/verify-peer-floors.js [--keep]
 *
 *   --keep   leave the worktrees and the TypeScript consumer in place
 *            (debugging)
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const keep = process.argv.includes("--keep")

/**
 * Peers whose range joins majors that behave differently, per package. Each
 * major's floor is installed under the devDependency named here, and the
 * package's tests run every copy: react's `react` vitest project resolves
 * `@icp-sdk/auth` and its `auth-v8` project aliases it to `@icp-sdk/auth-v8`.
 * These are pinned through devDependencies only, because an override keyed by
 * the package name would move both copies to one version. A major the range
 * accepts but no devDependency installs fails the check.
 */
const PER_MAJOR = {
  react: {
    "@icp-sdk/auth": { 8: "@icp-sdk/auth-v8", 10: "@icp-sdk/auth" },
  },
}

/**
 * The packages checked, in the order they run. `follows` pins a dependency of a
 * peer to the peer's floor: @tanstack/react-query depends on the query-core of
 * the same version, and core (a workspace devDependency at the newest release)
 * has to resolve that same copy, as it would in an application.
 */
const CHECKS = [
  { pkg: "core" },
  {
    pkg: "react",
    follows: { "@tanstack/query-core": "@tanstack/react-query" },
    typesFor: ["react", "react-dom"],
    // react imports core through core's built dist.
    buildFirst: ["core"],
  },
]

/** Parses `X.Y.Z` (no prerelease) into numbers. */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (!match) return undefined
  return match.slice(1).map(Number)
}

function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)]
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return 0
}

/**
 * The lowest version each `||` alternative of a peer range accepts.
 *
 * Supports the shapes this repo writes (`^X.Y.Z`, `~X.Y.Z`, `>=X.Y.Z`,
 * `X.Y.Z`, and `||` between them) and refuses anything else, so a new kind of
 * range fails here loudly instead of being pinned to a guess.
 */
function alternativeFloors(range) {
  return range.split("||").map((part) => {
    const text = part.trim()
    const match = /^(\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(text)
    if (!match) {
      throw new Error(`Cannot tell the lowest version of range "${range}"`)
    }
    return match[2]
  })
}

/** The lowest version a peer range accepts. */
function lowestVersion(range) {
  return alternativeFloors(range).sort(compareVersions)[0]
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HUSKY: "0" },
  })
  return result.status === 0
}

/**
 * The pins for one check, from the package's own peer ranges: `overrides` for
 * every copy in the graph, and `devDependencies` for the per-major installs.
 */
function pinsFor(check) {
  const manifest = readJson(
    join(rootDir, "packages", check.pkg, "package.json")
  )
  const perMajor = PER_MAJOR[check.pkg] ?? {}
  const overrides = {}
  const devDependencies = {}

  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!(name in perMajor)) {
      overrides[name] = lowestVersion(range)
      continue
    }
    for (const floor of alternativeFloors(range)) {
      const [major] = parseVersion(floor)
      const installAs = perMajor[name][major]
      if (!installAs) {
        throw new Error(
          `${check.pkg} accepts ${name} ${major}.x, but no devDependency installs that major for its tests (PER_MAJOR in ${fileURLToPath(import.meta.url)})`
        )
      }
      devDependencies[installAs] =
        installAs === name ? floor : `npm:${name}@${floor}`
    }
  }
  for (const [name, peer] of Object.entries(check.follows ?? {})) {
    overrides[name] = overrides[peer]
  }
  for (const name of check.typesFor ?? []) {
    const [major] = parseVersion(overrides[name])
    overrides[`@types/${name}`] = `^${major}.0.0`
  }
  return { overrides, devDependencies }
}

function verify(check) {
  const { overrides, devDependencies } = pinsFor(check)
  const worktree = mkdtempSync(join(tmpdir(), `peer-floor-${check.pkg}-`))
  console.log(
    `\n▶ ${check.pkg}: ${JSON.stringify({ ...overrides, ...devDependencies })}`
  )

  execFileSync("git", ["worktree", "add", "--detach", worktree, "HEAD"], {
    cwd: rootDir,
    stdio: "ignore",
  })

  try {
    // Overrides pinned twice: in `pnpm.overrides`, so transitive copies follow,
    // and as the package's own devDependency, so its tests import the pinned
    // release. Per-major pins go to their devDependencies alone.
    const rootManifestPath = join(worktree, "package.json")
    const rootManifest = readJson(rootManifestPath)
    rootManifest.pnpm = rootManifest.pnpm ?? {}
    rootManifest.pnpm.overrides = {
      ...rootManifest.pnpm.overrides,
      ...overrides,
    }
    writeJson(rootManifestPath, rootManifest)

    const manifestPath = join(worktree, "packages", check.pkg, "package.json")
    const manifest = readJson(manifestPath)
    for (const [name, version] of Object.entries({
      ...overrides,
      ...devDependencies,
    })) {
      if (manifest.devDependencies?.[name] === undefined) {
        if (name in devDependencies) {
          throw new Error(`${check.pkg} has no devDependency named ${name}`)
        }
        continue
      }
      manifest.devDependencies[name] = version
    }
    writeJson(manifestPath, manifest)

    // Each project named on its own: selected only as a dependency (`react...`),
    // core would be installed without the devDependencies its build needs.
    const projects = [...(check.buildFirst ?? []), check.pkg]
    const filters = projects.flatMap((pkg) => ["--filter", `./packages/${pkg}`])
    const steps = [
      ["pnpm", ["install", "--no-frozen-lockfile", ...filters]],
      ...(check.buildFirst ?? []).map((pkg) => [
        "pnpm",
        ["--filter", `@ic-reactor/${pkg}`, "build"],
      ]),
      ["pnpm", ["--filter", `@ic-reactor/${check.pkg}`, "typecheck"]],
      ["pnpm", ["--filter", `@ic-reactor/${check.pkg}`, "test"]],
    ]
    for (const [command, args] of steps) {
      if (!run(command, args, worktree)) {
        console.error(`✖ ${check.pkg}: \`${command} ${args.join(" ")}\` failed`)
        return false
      }
    }
    console.log(`✔ ${check.pkg} passes at its peer floors`)
    return true
  } finally {
    if (keep) {
      console.log(`  worktree kept at ${worktree}`)
    } else {
      execFileSync("git", ["worktree", "remove", "--force", worktree], {
        cwd: rootDir,
        stdio: "ignore",
      })
    }
  }
}

/** Compiles the built declarations with the oldest supported TypeScript. */
function verifyTypeScriptFloor() {
  const script = join(rootDir, "scripts", "verify-typescript-floor.js")
  return run(process.execPath, [script, ...(keep ? ["--keep"] : [])], rootDir)
}

const failed = []
if (!verifyTypeScriptFloor()) {
  failed.push("the declarations at the TypeScript floor")
}
for (const check of CHECKS) {
  if (!verify(check)) failed.push(`${check.pkg} at its peer floors`)
}
if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(", ")}`)
  process.exit(1)
}
console.log(
  "\nThe declarations compile at the TypeScript floor, and every checked package works at its declared peer floors."
)
