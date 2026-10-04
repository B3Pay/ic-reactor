// What setup.mjs refuses to ship for the v4 condition: a guide that gives the
// hidden tests away, package code that names one, and (when the condition is
// built from npm) a tarball that is not the one pinned here. Shared by
// setup.mjs (which refuses the tree) and harness/ship.test.mjs (which checks
// the refusals on seeded files and the tree setup built).
//
// Where the v4 packages come from (`node setup.mjs --v4-from <source>`):
//
//   tree            (the default) built and packed from this repository with
//                   `pnpm pack`, as Addendum 3 did;
//   npm:<version>   the tarballs published on npm under that version, which
//                   must be listed in V4_NPM_RELEASES with each tarball's
//                   `dist.integrity` (Addendum 4: npm:4.0.0-beta.1).
//
// setup.mjs records which one built the tree in .ship/v4/source.json.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { EVALS } from "./assemble.mjs"
import { checkDocs, hiddenTestNames as testNamesOf } from "./check-docs.mjs"

/** The packages the v4 condition installs from tarballs (packed here, or from npm). */
export const V4_PACKAGES = ["@ic-reactor/core", "@ic-reactor/react"]

/**
 * The files outside `packages/` that building V4_PACKAGES reads, relative to
 * the repository root: the base tsconfig both packages extend, the workspace
 * and the lockfile that decide what the build compiles against. Tree mode
 * records a packed tree as dirty when any of these, or a package, has an
 * uncommitted change.
 */
export const V4_SHARED_BUILD_INPUTS = [
  "tsconfig.base.json",
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
]

/**
 * The published releases the v4 condition may be built from, with the
 * `dist.integrity` the npm registry records for each package's tarball
 * (`npm view <name>@<version> dist.integrity`, read on 2026-10-05). setup
 * refuses a version not listed here, and a downloaded tarball whose sha512 is
 * not the one listed, or that the registry no longer records: what agents get
 * is byte for byte the tarball a pre-registration names.
 */
export const V4_NPM_RELEASES = {
  "4.0.0-beta.1": {
    "@ic-reactor/core":
      "sha512-qvxoX5SJa0ubJumLRctpYx9SqFynu3PXKO9E2fJpiDMKrb6y6rlxncR6XBALqjDdFi8UVYJxWXMhqG8Va/6alg==",
    "@ic-reactor/react":
      "sha512-U0Bvz6qRmrnDCXCd27T28EJ3SNO5Z3eu2oENrHE5CMg6v36AzcjDWgwSzGTL+f8LDxGaFhvcuCGVAEYypNpCMg==",
  },
}

/** Where setup.mjs records the source of the v4 tree it built. */
export const V4_SOURCE_FILE = join(EVALS, ".ship", "v4", "source.json")

/**
 * `--v4-from` → `{ from: "tree" }` or `{ from: "npm", version }`. Throws for
 * anything else, and for a version {@link V4_NPM_RELEASES} does not pin.
 */
export function parseV4From(value = "tree", releases = V4_NPM_RELEASES) {
  if (value === "tree") return { from: "tree" }
  const npm = /^npm:(.+)$/.exec(value)
  if (!npm)
    throw new Error(
      `--v4-from is "tree" or "npm:<version>", not ${JSON.stringify(value)}`
    )
  const version = npm[1]
  if (!Object.hasOwn(releases, version))
    throw new Error(
      `--v4-from npm:${version}: no pinned integrity for ${version} ` +
        `(harness/ship.mjs V4_NPM_RELEASES pins ${Object.keys(releases).join(", ")}); ` +
        "add each tarball's dist.integrity there first"
    )
  return { from: "npm", version }
}

/** A file's Subresource Integrity string as npm records it: `sha512-<base64>`. */
export function integrityOf(file) {
  return `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`
}

/** The file name `npm pack` and `pnpm pack` give `name`'s tarball. */
export function tarballName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`
}

/**
 * Why the tarballs in `dir` (as `npm pack <name>@<version>` names them) are
 * not the release {@link V4_NPM_RELEASES} pins: one is missing, its sha512
 * differs from the pin, or the registry's `dist.integrity` (`registry`, as
 * `{ [name]: integrity }`; omitted, not checked) differs from the pin. One
 * line per finding; empty when every tarball is the pinned one.
 */
export function v4TarballFindings(
  dir,
  version,
  { registry, releases = V4_NPM_RELEASES } = {}
) {
  const pinned = releases[version]
  if (!pinned) return [`no pinned integrity for ${version}`]
  const findings = []
  for (const name of V4_PACKAGES) {
    const file = join(dir, tarballName(name, version))
    if (!existsSync(file)) {
      findings.push(
        `${name}@${version}: no tarball ${tarballName(name, version)}`
      )
      continue
    }
    const actual = integrityOf(file)
    if (actual !== pinned[name])
      findings.push(
        `${name}@${version}: the tarball's integrity is ${actual}, the pin is ${pinned[name]}`
      )
    if (registry && registry[name] !== pinned[name])
      findings.push(
        `${name}@${version}: the registry records ${registry[name]}, the pin is ${pinned[name]}`
      )
  }
  return findings
}

/** `npm pack <name>@<version>` into `dir`. */
function npmPack(dir, name, version) {
  execFileSync(
    "npm",
    [
      "pack",
      `${name}@${version}`,
      "--pack-destination",
      dir,
      "--loglevel=error",
    ],
    { cwd: dir, stdio: ["ignore", "ignore", "inherit"] }
  )
}

/** `npm view <name>@<version> dist.integrity`: what the registry records. */
function npmViewIntegrity(dir, name, version) {
  return JSON.parse(
    execFileSync(
      "npm",
      ["view", `${name}@${version}`, "dist.integrity", "--json"],
      { cwd: dir, encoding: "utf8" }
    )
  )
}

/**
 * Downloads the {@link V4_PACKAGES} tarballs of `version` into `dir` and asks
 * the registry what it records for each, then throws (one line per
 * {@link v4TarballFindings} finding) unless every tarball is the pinned one
 * and the registry records the pin. `pack` and `view` default to npm
 * (setup.mjs); the tests pass fakes.
 */
export function fetchV4Tarballs(
  dir,
  version,
  { pack = npmPack, view = npmViewIntegrity, releases = V4_NPM_RELEASES } = {}
) {
  const registry = {}
  for (const name of V4_PACKAGES) {
    pack(dir, name, version)
    registry[name] = view(dir, name, version)
  }
  const findings = v4TarballFindings(dir, version, { registry, releases })
  if (findings.length > 0)
    throw new Error(
      `setup: the npm tarballs are not the pinned ${version}:\n  ${findings.join("\n  ")}`
    )
}

/** A guide's size and identity: words as `wc -w` counts them, and its sha256. */
export function guideStats(text) {
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    sha256: createHash("sha256").update(text).digest("hex"),
  }
}

/** The source of the v4 tree the last `node setup.mjs` built, or null. */
export function v4Source(file = V4_SOURCE_FILE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null
}

/** One line naming a v4 source (drive.mjs prints it in a dry run). */
export function describeV4Source(source) {
  if (!source) return "no .ship/v4/source.json: run `node setup.mjs`"
  const guide = `guide ${source.guide.words} words, sha256 ${source.guide.sha256}`
  if (source.from === "npm")
    return (
      `npm ${source.version} (` +
      V4_PACKAGES.map((n) => `${n} ${source.integrity[n]}`).join("; ") +
      `); ${guide}`
    )
  return `packed from this repository at ${source.commit}${source.dirty ? " (uncommitted changes)" : ""}; ${guide}`
}

/** What a shipped v4 package keeps: what a built package needs at run time. */
export const V4_PACKAGE_ENTRIES = ["dist", "package.json"]

/**
 * The packages whose classes cross between the hidden tests' world (which
 * imports them from evals' own install) and a v4 solution: in the scorer's
 * install (conditions/v4/node_modules) each is a link to evals' copy, so
 * both sides load one instance of it, as they do in every other condition.
 */
export const V4_SHARED_WITH_WORLD = ["@icp-sdk/core"]

/**
 * Every hidden-test name (harness/check-docs.mjs), as written and with
 * spaces for underscores, lower-cased. Only names: the distinctive literals
 * check-docs also looks for in a guide (amounts, `HTTP 429`, runs of zeros)
 * occur legitimately in a library that parses amounts and classifies HTTP
 * statuses.
 */
export function hiddenTestNames() {
  return [...new Set(testNamesOf().map(({ needle }) => needle.toLowerCase()))]
}

const CODE_FILE = /\.(js|cjs|mjs|ts|cts|mts|map|json)$/

/**
 * The hidden-test names found in the code files (JavaScript, declarations,
 * source maps, JSON) under `root`, as `{ file, needle }` with `file` relative
 * to `root`.
 */
export function namedInCode(root, names = hiddenTestNames()) {
  const hits = []
  for (const file of readdirSync(root, { recursive: true })) {
    if (!CODE_FILE.test(file)) continue
    const text = readFileSync(join(root, file), "utf8").toLowerCase()
    for (const needle of names) {
      if (text.includes(needle)) hits.push({ file, needle })
    }
  }
  return hits
}

/**
 * Why a freshly installed v4 ship tree (`<dir>/node_modules`, before its
 * packages are cut to {@link V4_PACKAGE_ENTRIES}) must be refused: the core
 * tarball's llms.txt, the condition's only guide, holds a hidden-test name
 * or distinctive literal (harness/check-docs.mjs), or a package's code names
 * a hidden test. One line per finding; empty when the tree may ship.
 */
export function v4ShipFindings(dir) {
  const modules = join(dir, "node_modules")
  const guide = join(modules, "@ic-reactor", "core", "llms.txt")
  const findings = checkDocs([guide]).hits.map(
    (hit) => `guide ${hit.file}: ${JSON.stringify(hit.needle)} from ${hit.from}`
  )
  const names = hiddenTestNames()
  for (const name of V4_PACKAGES) {
    for (const hit of namedInCode(join(modules, name), names)) {
      findings.push(`code ${name}/${hit.file}: ${JSON.stringify(hit.needle)}`)
    }
  }
  return findings
}
