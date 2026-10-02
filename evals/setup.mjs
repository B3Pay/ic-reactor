#!/usr/bin/env node
// One-time setup after `pnpm install` in evals/ (idempotent; re-run freely):
//
// 1. Generates the candid-core module from harness/icrc1.did with the
//    published `candid-core-cli gen` (0.1.0) into the thin and v4-proto
//    starters, so what agents see is exactly what the CLI emits.
// 2. Copies the v3 declarations (the @icp-sdk/bindgen output the repo's
//    tanstack-router example carries for the same .did) into the v3 starter.
// 3. Copies each condition's documentation into conditions/<c>/docs:
//    v3 gets the repo's llms-full.txt (as of 3.13.0, from git) and the
//    llms.txt files shipped inside @ic-reactor/core and @ic-reactor/react
//    3.13.0; thin gets the READMEs shipped inside @candid-core/schema 0.2.0
//    and @candid-core/cli 0.1.0; v4-proto's and thin-guide's docs/llms.txt
//    are hand-written and live in the repo (thin-guide also inherits thin's
//    docs through its "base"); v4's is copied in step 7.
// 4. Builds the v4-proto prototype (conditions/v4-proto/lib → dist).
// 5. Vendors the public test scaffold's fake replica.
// 6. Removes scorer caches from the conditions' node_modules.
// 7. Builds what agents are shipped: .ship/<condition>/node_modules.
//
// The v4 condition (issue #786) is ic-reactor 4 itself: setup builds
// packages/core and packages/react of this repository, packs them with
// `pnpm pack` (as a release would publish them), installs the tarballs
// (never workspace links) into .ship/v4, copies the core tarball's llms.txt
// into conditions/v4/docs, and gives the scorer the same install as
// conditions/v4/node_modules. Its starter module comes from the published
// @candid-core/cli beta that pairs with @candid-core/schema 0.3.0-beta.1.
import { execFileSync, spawnSync } from "node:child_process"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EVALS } from "./harness/assemble.mjs"
import {
  V4_PACKAGES,
  V4_PACKAGE_ENTRIES,
  v4ShipFindings,
} from "./harness/ship.mjs"

const REPO = join(EVALS, "..")
const nm = join(EVALS, "node_modules")

/**
 * The generator of the v4 condition's starter module: the published CLI beta
 * whose exact peer is the schema runtime the condition installs
 * (conditions/v4/package.json). Run through npx in a scratch directory, so
 * evals' own @candid-core/cli 0.1.0 (thin, v4-proto) is never picked up.
 */
const V4_CLI = "@candid-core/cli@0.2.0-beta.1"

/**
 * The repository commit whose root llms-full.txt is the v3 condition's guide
 * (3.13.0, as published). The v4 tree no longer has that file at its root.
 */
const V3_DOCS_COMMIT = "623b48c11"

function step(message) {
  process.stdout.write(`setup: ${message}\n`)
}

// 1. candid-core generated module
const out = mkdtempSync(join(tmpdir(), "ic-reactor-evals-gen-"))
execFileSync(
  process.execPath,
  [
    join(nm, "@candid-core", "cli", "bin", "cli.js"),
    "gen",
    join(EVALS, "harness", "icrc1.did"),
    "-o",
    out,
  ],
  { stdio: ["ignore", "inherit", "inherit"] }
)
const generated = readFileSync(join(out, "icrc1.ts"), "utf8")
rmSync(out, { recursive: true, force: true })
for (const condition of ["thin", "v4-proto"]) {
  const dir = join(
    EVALS,
    "conditions",
    condition,
    "starter",
    "src",
    "generated"
  )
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "icrc1.ts"), generated)
}
step("generated src/generated/icrc1.ts for thin and v4-proto")

// 1b. The v4 condition's module, from the CLI beta. Only icrc1.ts goes into
//     the starter; the CLI's icrc1.envelope.json (the contract the module was
//     generated from) is not something an app imports.
{
  const out = mkdtempSync(join(tmpdir(), "ic-reactor-evals-gen-v4-"))
  try {
    execFileSync(
      "npx",
      [
        "--yes",
        V4_CLI,
        "gen",
        join(EVALS, "harness", "icrc1.did"),
        "-o",
        join(out, "generated"),
      ],
      { cwd: out, stdio: ["ignore", "ignore", "inherit"] }
    )
    const dir = join(EVALS, "conditions", "v4", "starter", "src", "generated")
    mkdirSync(dir, { recursive: true })
    copyFileSync(join(out, "generated", "icrc1.ts"), join(dir, "icrc1.ts"))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
  step(`generated src/generated/icrc1.ts for v4 (${V4_CLI})`)
}

// 2. v3 declarations
const decl = join(EVALS, "conditions", "v3", "starter", "src", "declarations")
mkdirSync(decl, { recursive: true })
for (const file of ["icrc1.did.js", "icrc1.did.d.ts"]) {
  copyFileSync(join(EVALS, "harness", "declarations", file), join(decl, file))
}
step("copied src/declarations/ for v3")

// 3. docs
const docs = (condition) => {
  const dir = join(EVALS, "conditions", condition, "docs")
  mkdirSync(dir, { recursive: true })
  return dir
}
const v3 = join(EVALS, "conditions", "v3", "node_modules", "@ic-reactor")
{
  // v3's llms-full.txt is the repository root's at the 3.13.0 commit, read
  // from git; without that commit (a shallow clone) the tracked copy stays.
  const target = join(docs("v3"), "llms-full.txt")
  const shown = spawnSync(
    "git",
    ["-C", REPO, "show", `${V3_DOCS_COMMIT}:llms-full.txt`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  if (shown.status === 0) writeFileSync(target, shown.stdout)
  else if (existsSync(target))
    step(`kept the tracked v3 llms-full.txt (${V3_DOCS_COMMIT} not available)`)
  else throw new Error(`setup: cannot read ${V3_DOCS_COMMIT}:llms-full.txt`)
}
copyFileSync(
  join(v3, "core", "llms.txt"),
  join(docs("v3"), "ic-reactor-core.llms.txt")
)
copyFileSync(
  join(v3, "react", "llms.txt"),
  join(docs("v3"), "ic-reactor-react.llms.txt")
)
copyFileSync(
  join(nm, "@candid-core", "schema", "README.md"),
  join(docs("thin"), "candid-core-schema.README.md")
)
copyFileSync(
  join(nm, "@candid-core", "cli", "README.md"),
  join(docs("thin"), "candid-core-cli.README.md")
)
step("copied docs for v3 and thin (v4-proto/docs/llms.txt is hand-written)")

// 4. v4-proto build
const lib = join(EVALS, "conditions", "v4-proto", "lib")
rmSync(join(lib, "dist"), { recursive: true, force: true })
execFileSync(
  process.execPath,
  [
    join(lib, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    join(lib, "tsconfig.json"),
  ],
  {
    stdio: ["ignore", "inherit", "inherit"],
  }
)
step("built conditions/v4-proto/lib/dist")

// 4b. The v4 packages: built from this repository's sources, then packed as a
//     release would publish them (pnpm rewrites `workspace:` ranges).
const v4Tarballs = mkdtempSync(join(tmpdir(), "ic-reactor-evals-pack-"))
{
  const filters = V4_PACKAGES.flatMap((name) => ["--filter", name])
  execFileSync("corepack", ["pnpm", ...filters, "build"], {
    cwd: REPO,
    stdio: ["ignore", "ignore", "inherit"],
  })
  execFileSync(
    "corepack",
    ["pnpm", ...filters, "pack", "--pack-destination", v4Tarballs],
    { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] }
  )
  step(
    `packed ${V4_PACKAGES.join(", ")} (${readdirSync(v4Tarballs).join(", ")})`
  )
}

/** The tarball `pnpm pack` wrote for `name` (`@scope/pkg` → `scope-pkg-<version>.tgz`). */
function v4Tarball(name) {
  const prefix = `${name.replace(/^@/, "").replace("/", "-")}-`
  const found = readdirSync(v4Tarballs).filter(
    (file) => file.startsWith(prefix) && /^\d/.test(file.slice(prefix.length))
  )
  if (found.length !== 1)
    throw new Error(`setup: expected one tarball for ${name}, found ${found}`)
  return found[0]
}

// 5. The public test scaffold's fake replica: the one @ic-reactor/core
//    3.13.0 publishes, vendored with its comments (which document ic-reactor's
//    own API) stripped, so every condition gets the same neutral file.
{
  const source = readFileSync(
    join(nm, "@ic-reactor", "core", "dist", "testing", "fake-replica.js"),
    "utf8"
  )
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n")
    .replace(
      'import { getNetworkByHostname } from "../utils/helper.js";',
      '// Pages on a mainnet domain are not answered by default.\nconst getNetworkByHostname = (hostname) => /(^|\\.)(ic0\\.app|icp0\\.io|icp-api\\.io)$/.test(hostname) ? "ic" : "local";'
    )
    .replace(/\n{3,}/g, "\n\n")
    .replaceAll(
      "@ic-reactor/core/testing/fakeReplica",
      "test-support/fakeReplica"
    )
  if (stripped.includes("../utils/helper.js") || /ic-reactor/i.test(stripped)) {
    throw new Error("setup: could not inline the fake replica's helper import")
  }
  writeFileSync(
    join(EVALS, "harness", "public", "support", "fake-replica.js"),
    "// A fake Internet Computer replica for local tests: it answers the IC HTTP\n" +
      "// API through globalThis.fetch and signs what a replica signs. Types in\n" +
      "// fake-replica.d.ts.\n" +
      stripped
  )
  step("vendored harness/public/support/fake-replica.js")
}

// 6. Scorer caches must never sit in a condition's node_modules (vitest's
//    results.json names the hidden test files).
for (const condition of ["v3", "thin", "v4-proto", "v4"]) {
  for (const dir of [".vite", ".vite-temp", ".cache"]) {
    rmSync(join(EVALS, "conditions", condition, "node_modules", dir), {
      recursive: true,
      force: true,
    })
  }
}
step("removed .vite/.vite-temp/.cache from the conditions' node_modules")

// 7. What agents are shipped: a flat npm install per condition (.ship/<c>),
//    real files and relative .bin links only — no pnpm store paths, no
//    NODE_PATH into the repository — with the v4-proto package as a built
//    package would ship: package.json + dist/. The v4 packages are installed
//    from their tarballs (copied into .ship/v4/tarballs, so the install
//    records only relative paths) and then cut to package.json + dist/ too:
//    their README and sources would be documentation beyond the one guide
//    the condition gives (conditions/v4/docs/llms.txt, taken from the core
//    tarball before the cut).
const ship = join(EVALS, ".ship")
/** Refuses a ship tree: it is deleted, so no run can be built from it. */
function refuse(dir, message) {
  rmSync(dir, { recursive: true, force: true })
  throw new Error(`setup: ${message}`)
}
for (const condition of ["v3", "thin", "v4-proto", "v4"]) {
  const dir = join(ship, condition)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const pkg = JSON.parse(
    readFileSync(join(EVALS, "conditions", condition, "package.json"), "utf8")
  )
  const dependencies = { ...pkg.dependencies }
  delete dependencies["@ic-reactor/v4-proto"]
  if (condition === "v4") {
    mkdirSync(join(dir, "tarballs"))
    for (const name of V4_PACKAGES) {
      if (!String(dependencies[name]).startsWith("workspace:"))
        throw new Error(`setup: conditions/v4 must take ${name} from the repo`)
      const file = v4Tarball(name)
      copyFileSync(join(v4Tarballs, file), join(dir, "tarballs", file))
      dependencies[name] = `file:tarballs/${file}`
    }
  }
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `ship-${condition}`,
        private: true,
        type: "module",
        dependencies,
        // vite is vitest's peer: --legacy-peer-deps (below) does not install
        // peers, so it is pinned to the version pnpm resolved for the harness.
        devDependencies: { ...pkg.devDependencies, vite: "8.3.1" },
      },
      null,
      2
    ) + "\n"
  )
  // --legacy-peer-deps works around an npm 11 arborist crash in peer-set
  // resolution; every peer the conditions need is a direct dependency.
  execFileSync(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      "--legacy-peer-deps",
    ],
    { cwd: dir, stdio: ["ignore", "inherit", "inherit"] }
  )
  if (condition === "v4-proto") {
    const target = join(dir, "node_modules", "@ic-reactor", "v4-proto")
    mkdirSync(target, { recursive: true })
    cpSync(join(lib, "dist"), join(target, "dist"), { recursive: true })
    const libPkg = JSON.parse(readFileSync(join(lib, "package.json"), "utf8"))
    writeFileSync(
      join(target, "package.json"),
      JSON.stringify(
        {
          name: libPkg.name,
          version: libPkg.version,
          description: libPkg.description,
          type: "module",
          exports: libPkg.exports,
          peerDependencies: libPkg.peerDependencies,
        },
        null,
        2
      ) + "\n"
    )
  }
  if (condition === "v4") {
    // The guide must not give the hidden tests away and the shipped code must
    // not name a hidden test (harness/ship.mjs). Checked before anything is
    // copied or cut, so a refused guide reaches neither conditions/v4/docs
    // nor a ship tree.
    const findings = v4ShipFindings(dir)
    if (findings.length > 0)
      refuse(dir, `v4 would leak the hidden tests:\n  ${findings.join("\n  ")}`)
    const guide = join(dir, "node_modules", "@ic-reactor", "core", "llms.txt")
    const docsDir = join(EVALS, "conditions", "v4", "docs")
    rmSync(docsDir, { recursive: true, force: true })
    mkdirSync(docsDir, { recursive: true })
    copyFileSync(guide, join(docsDir, "llms.txt"))
    for (const name of V4_PACKAGES) {
      const target = join(dir, "node_modules", ...name.split("/"))
      for (const entry of readdirSync(target)) {
        if (!V4_PACKAGE_ENTRIES.includes(entry))
          rmSync(join(target, entry), { recursive: true, force: true })
      }
    }
  }
  // Every non-optional dependency must be installed.
  const unmet = spawnSync("npm", ["ls", "--all"], {
    cwd: dir,
    encoding: "utf8",
  })
    .stdout.split("\n")
    .filter(
      (line) => /UNMET (PEER )?DEPENDENCY/.test(line) && !/OPTIONAL/.test(line)
    )
  if (unmet.length > 0)
    refuse(dir, `${condition} ships unmet dependencies:\n${unmet.join("\n")}`)
  // Nothing shipped may point back into the repository or name a hidden test.
  const leaks = spawnSync(
    "grep",
    [
      "-rlI",
      "-e",
      REPO,
      "-e",
      ".hidden/",
      "-e",
      "hidden/react-wallet",
      "-e",
      "hidden/node-tool",
      join(dir, "node_modules"),
    ],
    { encoding: "utf8" }
  ).stdout.trim()
  if (leaks) refuse(dir, `shipped node_modules leak paths:\n${leaks}`)
}
step("built .ship/<condition>/node_modules (npm, flat; checked for repo paths)")

// 8. The scorer's install of v4 is the shipped one: the v4 packages exist
//    only as tarballs, so conditions/v4 is not a member of evals' pnpm
//    workspace, and the hidden tests run against exactly what agents get.
{
  const target = join(EVALS, "conditions", "v4", "node_modules")
  rmSync(target, { recursive: true, force: true })
  cpSync(join(ship, "v4", "node_modules"), target, {
    recursive: true,
    verbatimSymlinks: true,
  })
  rmSync(v4Tarballs, { recursive: true, force: true })
  step("copied .ship/v4/node_modules to conditions/v4/node_modules (scoring)")
}
