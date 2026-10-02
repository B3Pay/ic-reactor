#!/usr/bin/env node
// One-time setup after `pnpm install` in evals/ (idempotent; re-run freely):
//
// 1. Generates the candid-core module from harness/icrc1.did with the
//    published `candid-core-cli gen` (0.1.0) into the thin and v4-proto
//    starters, so what agents see is exactly what the CLI emits.
// 2. Copies the v3 declarations (the @icp-sdk/bindgen output the repo's
//    tanstack-router example carries for the same .did) into the v3 starter.
// 3. Copies each condition's documentation into conditions/<c>/docs:
//    v3 gets the repo's llms-full.txt and the llms.txt files shipped inside
//    @ic-reactor/core and @ic-reactor/react 3.13.0; thin gets the READMEs
//    shipped inside @candid-core/schema 0.2.0 and @candid-core/cli 0.1.0;
//    v4-proto's and thin-guide's docs/llms.txt are hand-written and live in
//    the repo (thin-guide also inherits thin's docs through its "base").
// 4. Builds the v4-proto prototype (conditions/v4-proto/lib → dist).
import { execFileSync, spawnSync } from "node:child_process"
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EVALS } from "./harness/assemble.mjs"

const REPO = join(EVALS, "..")
const nm = join(EVALS, "node_modules")

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
copyFileSync(join(REPO, "llms-full.txt"), join(docs("v3"), "llms-full.txt"))
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
for (const condition of ["v3", "thin", "v4-proto"]) {
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
//    package would ship: package.json + dist/.
const ship = join(EVALS, ".ship")
for (const condition of ["v3", "thin", "v4-proto"]) {
  const dir = join(ship, condition)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const pkg = JSON.parse(
    readFileSync(join(EVALS, "conditions", condition, "package.json"), "utf8")
  )
  const dependencies = { ...pkg.dependencies }
  delete dependencies["@ic-reactor/v4-proto"]
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
    throw new Error(
      `setup: ${condition} ships unmet dependencies:\n${unmet.join("\n")}`
    )
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
  if (leaks)
    throw new Error(`setup: shipped node_modules leak paths:\n${leaks}`)
}
step("built .ship/<condition>/node_modules (npm, flat; checked for repo paths)")
