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
 * like `^8.0.0 || ^10.0.0`, cannot be pinned to one floor: it has to be listed
 * in PER_MAJOR below, which installs each major's floor and runs the typecheck
 * and tests once per major, and a range that joins majors without an entry
 * there fails the check. The worktree is removed afterwards, so your checkout
 * is never touched; uncommitted changes are not part of the run.
 *
 * TypeScript has a floor too, and this runs its check first:
 * verify-typescript-floor.js compiles the declarations of core and react with
 * the oldest TypeScript the docs name. That check reads the declarations
 * `pnpm build` wrote to this checkout, not a worktree of HEAD: a worktree would
 * have to build the packages again, and CI has just built them here. Locally,
 * run `pnpm build` first.
 *
 * Usage
 *   node scripts/verify-peer-floors.js [--keep]
 *
 *   --keep   leave the worktrees and the TypeScript consumer in place
 *            (debugging)
 */
import { execFileSync, spawnSync } from "node:child_process"
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const SCRIPT = fileURLToPath(import.meta.url)

/**
 * Peers whose range joins majors that behave differently, per package, as
 * `{ <package>: { <peer>: { <major>: <devDependency that installs it> } } }`.
 * Each major's floor is installed in the worktree under the devDependency
 * named here (`"vite-4": "npm:vite@4.2.0"`), so one install holds every copy.
 * These are pinned through devDependencies only, because an override keyed by
 * the peer's name would move every copy to one version. Then, one copy at a
 * time, the package's `node_modules/<peer>` is linked to that copy and the
 * package's typecheck and tests run: everything the package resolves by the
 * peer's name (its sources, its tests, the servers its tests start, tsc) gets
 * that major's floor, with no switch in the package's own config. A copy that
 * fails does not stop the others, so one run names every major that fails. A
 * major the range accepts but no entry installs fails the check, and so does a
 * peer range that joins majors but has no entry here: pinning it to its lowest
 * floor would test one major and say nothing about the others.
 *
 * react's `@icp-sdk/auth ^8 || ^10` peer, the one entry 3.x had, went with the
 * 3.x auth hooks. Add an entry before declaring a peer range that joins majors.
 */
export const PER_MAJOR = {
  // `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`: 4.2.0, 5.0.0, 6.0.0,
  // 7.0.0 and 8.0.0. The tests start real dev, preview and build runs of each.
  "vite-plugin": {
    vite: { 4: "vite-4", 5: "vite-5", 6: "vite-6", 7: "vite-7", 8: "vite-8" },
  },
}

/**
 * The packages checked, in the order they run. `follows` pins a dependency of a
 * peer to the peer's floor: @tanstack/react-query depends on the query-core of
 * the same version, and core (a workspace devDependency at the newest release)
 * has to resolve that same copy, as it would in an application. react-dom is
 * not a peer of the bindings (the library never imports it), but its tests
 * render with it, and it is released with react: it follows react's floor.
 * vite-plugin's `vite` peer is in PER_MAJOR; its exact `@candid-core/cli` peer
 * has one version, which the lockfile already holds, and its optional
 * `@icp-sdk/core` peer (the fetch of a missing `.did`) is pinned to its floor
 * like any other. `withoutOverrides` drops
 * root `pnpm.overrides` that would move a floor's own dependencies off the
 * versions an app on that floor installs.
 */
export const CHECKS = [
  { pkg: "core" },
  {
    pkg: "react",
    follows: {
      "@tanstack/query-core": "@tanstack/react-query",
      "react-dom": "react",
    },
    typesFor: ["react", "react-dom"],
    // react imports core through core's built dist.
    buildFirst: ["core"],
  },
  {
    pkg: "vite-plugin",
    // The root pins rollup ^4.60.1 for the repository's own installs, which
    // would hand Vite 4 a rollup it does not depend on (^3). An app on Vite 4
    // gets rollup 3, so each Vite copy resolves its own rollup here.
    withoutOverrides: ["rollup"],
  },
]

/** Parses `X.Y.Z`, or `X.Y.Z-<prerelease>` (read as `X.Y.Z`), into numbers. */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(text)
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
 * `X.Y.Z`, an exact prerelease `X.Y.Z-<tag>`, and `||` between them) and
 * refuses anything else, so a new kind of range fails here loudly instead of
 * being pinned to a guess. A prerelease is accepted only exact, as core pins
 * `@candid-core/schema` (D24): its floor is then the version itself.
 */
export function alternativeFloors(range) {
  return range.split("||").map((part) => {
    const text = part.trim()
    const match =
      /^(?:(\^|~|>=)?(\d+\.\d+\.\d+)|(\d+\.\d+\.\d+-[0-9A-Za-z.-]+))$/.exec(
        text
      )
    if (!match) {
      throw new Error(`Cannot tell the lowest version of range "${range}"`)
    }
    return match[2] ?? match[3]
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
 * every copy in the graph, `devDependencies` for the per-major installs, and
 * `copies`, one per major of each PER_MAJOR peer, in the order they run.
 */
export function pinsFor(check, { rootDir = ROOT_DIR, perMajor: table } = {}) {
  const manifest = readJson(
    join(rootDir, "packages", check.pkg, "package.json")
  )
  const perMajor = (table ?? PER_MAJOR)[check.pkg] ?? {}
  const overrides = {}
  const devDependencies = {}
  const copies = []

  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    // A sibling of the lockstep lane (`@ic-reactor/core` as a peer of react),
    // written `workspace:*` and published as this version exactly: it has no
    // floor below it, and the worktree installs it from the workspace.
    if (range.startsWith("workspace:")) continue
    if (!(name in perMajor)) {
      const majors = [
        ...new Set(alternativeFloors(range).map((v) => parseVersion(v)[0])),
      ]
      if (majors.length > 1) {
        throw new Error(
          `${check.pkg} accepts ${name} "${range}", which joins majors ${majors.join(", ")}, but PER_MAJOR in ${SCRIPT} has no entry for it, so only its lowest floor would be tested`
        )
      }
      overrides[name] = lowestVersion(range)
      continue
    }
    for (const floor of alternativeFloors(range)) {
      const [major] = parseVersion(floor)
      const installAs = perMajor[name][major]
      if (!installAs) {
        throw new Error(
          `${check.pkg} accepts ${name} ${major}.x, but no devDependency installs that major for its tests (PER_MAJOR in ${SCRIPT})`
        )
      }
      devDependencies[installAs] =
        installAs === name ? floor : `npm:${name}@${floor}`
      copies.push({ peer: name, installAs, version: floor })
    }
  }
  for (const [name, peer] of Object.entries(check.follows ?? {})) {
    overrides[name] = overrides[peer]
  }
  for (const name of check.typesFor ?? []) {
    const [major] = parseVersion(overrides[name])
    overrides[`@types/${name}`] = `^${major}.0.0`
  }
  return { overrides, devDependencies, copies }
}

/**
 * Points the package's `node_modules/<peer>` at the copy installed under
 * `installAs`, so that every import of the peer from the package resolves it.
 */
function linkCopy(packageDir, { peer, installAs }) {
  const modules = join(packageDir, "node_modules")
  const target = realpathSync(join(modules, installAs))
  const link = join(modules, peer)
  let existing
  try {
    existing = lstatSync(link)
  } catch {
    existing = undefined
  }
  // A symlink is removed, never followed: the store's copy stays as it is.
  if (existing?.isSymbolicLink()) unlinkSync(link)
  else if (existing) rmSync(link, { recursive: true })
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(target, link, "dir")
}

/**
 * Runs one check in a throwaway worktree of `rootDir`'s HEAD and returns the
 * steps that failed (empty when the package works at its floors).
 *
 * @param {object} check An entry of CHECKS.
 * @param {object} [options]
 * @param {string} [options.rootDir] The repository; this one by default.
 * @param {object} [options.perMajor] In place of PER_MAJOR (tests).
 * @param {boolean} [options.keep] Leave the worktree in place.
 * @returns {string[]}
 */
export function verifyPackage(
  check,
  { rootDir = ROOT_DIR, perMajor, keep = false } = {}
) {
  const { overrides, devDependencies, copies } = pinsFor(check, {
    rootDir,
    perMajor,
  })
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
    for (const name of check.withoutOverrides ?? []) {
      delete rootManifest.pnpm.overrides[name]
    }
    writeJson(rootManifestPath, rootManifest)

    // An override moves a devDependency the package already has; a per-major
    // install is added, since the package's own install needs none of them.
    const packageDir = join(worktree, "packages", check.pkg)
    const manifestPath = join(packageDir, "package.json")
    const manifest = readJson(manifestPath)
    manifest.devDependencies = manifest.devDependencies ?? {}
    for (const [name, version] of Object.entries(overrides)) {
      if (manifest.devDependencies[name] !== undefined) {
        manifest.devDependencies[name] = version
      }
    }
    Object.assign(manifest.devDependencies, devDependencies)
    writeJson(manifestPath, manifest)

    // Each project named on its own: selected only as a dependency (`react...`),
    // core would be installed without the devDependencies its build needs.
    const projects = [...(check.buildFirst ?? []), check.pkg]
    const filters = projects.flatMap((pkg) => ["--filter", `./packages/${pkg}`])
    const setup = [
      ["pnpm", ["install", "--no-frozen-lockfile", ...filters]],
      ...(check.buildFirst ?? []).map((pkg) => [
        "pnpm",
        ["--filter", `@ic-reactor/${pkg}`, "build"],
      ]),
    ]
    for (const [command, args] of setup) {
      if (!run(command, args, worktree)) {
        console.error(`✖ ${check.pkg}: \`${command} ${args.join(" ")}\` failed`)
        return [`${check.pkg}: \`${command} ${args.join(" ")}\``]
      }
    }

    // Without a per-major peer, one pass at the pinned floors; with one, a
    // pass per copy, each named after the copy it ran.
    const passes =
      copies.length === 0
        ? [{ label: check.pkg }]
        : copies.map((copy) => ({
            label: `${check.pkg} at ${copy.peer} ${copy.version}`,
            copy,
          }))
    const failed = []
    for (const { label, copy } of passes) {
      if (copy) {
        console.log(`\n▶ ${label} (installed as ${copy.installAs})`)
        linkCopy(packageDir, copy)
      }
      for (const script of ["typecheck", "test"]) {
        const args = ["--filter", `@ic-reactor/${check.pkg}`, script]
        if (!run("pnpm", args, worktree)) {
          console.error(`✖ ${label}: \`pnpm ${args.join(" ")}\` failed`)
          failed.push(`${label}: ${script}`)
          break
        }
      }
    }
    if (failed.length === 0) {
      console.log(`✔ ${check.pkg} passes at its peer floors`)
    }
    return failed
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
function verifyTypeScriptFloor(keep) {
  const script = join(ROOT_DIR, "scripts", "verify-typescript-floor.js")
  return run(process.execPath, [script, ...(keep ? ["--keep"] : [])], ROOT_DIR)
}

function main() {
  const keep = process.argv.includes("--keep")
  const failed = []
  if (!verifyTypeScriptFloor(keep)) {
    failed.push("the declarations at the TypeScript floor")
  }
  for (const check of CHECKS) {
    failed.push(...verifyPackage(check, { keep }))
  }
  if (failed.length > 0) {
    console.error(`\nFailed:\n${failed.map((f) => `- ${f}`).join("\n")}`)
    process.exit(1)
  }
  console.log(
    "\nThe declarations compile at the TypeScript floor, and every checked package works at its declared peer floors."
  )
}

// Run as the command, not when the tests import the tables. Node resolves the
// main module's symlinks (`/tmp` is one on macOS, and so is a linked script),
// so the path it was started by is compared as a real path too: a plain
// comparison would skip main() there and exit 0 having checked nothing.
if (process.argv[1] && SCRIPT === realpathOrSelf(process.argv[1])) {
  main()
}

function realpathOrSelf(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
