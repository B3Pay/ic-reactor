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
 * and runs the package's typecheck and tests there. The worktree is removed
 * afterwards, so your checkout is never touched; uncommitted changes are not
 * part of the run.
 *
 * Usage
 *   node scripts/verify-peer-floors.js [--keep]
 *
 *   --keep   leave the worktrees in place (debugging)
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const keep = process.argv.includes("--keep")

/**
 * Peers that are not pinned, and why. Anything else in a checked package's
 * `peerDependencies` is pinned to its floor.
 */
const NOT_PINNED = {
  // Two majors with different protocols; react's `auth-v8` vitest project runs
  // the real-client suite against v8 already, so a floor pin adds nothing.
  "@icp-sdk/auth": "both supported majors run in react's own test projects",
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
 * The lowest version a peer range accepts.
 *
 * Supports the shapes this repo writes (`^X.Y.Z`, `~X.Y.Z`, `>=X.Y.Z`,
 * `X.Y.Z`, and `||` between them) and refuses anything else, so a new kind of
 * range fails here loudly instead of being pinned to a guess.
 */
function lowestVersion(range) {
  const floors = range.split("||").map((part) => {
    const text = part.trim()
    const match = /^(\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(text)
    if (!match) {
      throw new Error(`Cannot tell the lowest version of range "${range}"`)
    }
    return match[2]
  })
  return floors.sort(compareVersions)[0]
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

/** The pins for one check, from the package's own peer ranges. */
function pinsFor(check) {
  const manifest = readJson(
    join(rootDir, "packages", check.pkg, "package.json")
  )
  const pins = {}
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (name in NOT_PINNED) continue
    pins[name] = lowestVersion(range)
  }
  for (const [name, peer] of Object.entries(check.follows ?? {})) {
    pins[name] = pins[peer]
  }
  for (const name of check.typesFor ?? []) {
    const [major] = parseVersion(pins[name])
    pins[`@types/${name}`] = `^${major}.0.0`
  }
  return pins
}

function verify(check) {
  const pins = pinsFor(check)
  const worktree = mkdtempSync(join(tmpdir(), `peer-floor-${check.pkg}-`))
  console.log(`\n▶ ${check.pkg}: ${JSON.stringify(pins)}`)

  execFileSync("git", ["worktree", "add", "--detach", worktree, "HEAD"], {
    cwd: rootDir,
    stdio: "ignore",
  })

  try {
    // Pinned twice: as an override, so transitive copies follow, and as the
    // package's own devDependency, so its tests import the pinned release.
    const rootManifestPath = join(worktree, "package.json")
    const rootManifest = readJson(rootManifestPath)
    rootManifest.pnpm = rootManifest.pnpm ?? {}
    rootManifest.pnpm.overrides = { ...rootManifest.pnpm.overrides, ...pins }
    writeJson(rootManifestPath, rootManifest)

    const manifestPath = join(worktree, "packages", check.pkg, "package.json")
    const manifest = readJson(manifestPath)
    for (const name of Object.keys(pins)) {
      if (manifest.devDependencies?.[name] !== undefined) {
        manifest.devDependencies[name] = pins[name]
      }
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

const failed = CHECKS.filter((check) => !verify(check)).map((c) => c.pkg)
if (failed.length > 0) {
  console.error(`\nPeer floors not met by: ${failed.join(", ")}`)
  process.exit(1)
}
console.log("\nEvery checked package works at its declared peer floors.")
