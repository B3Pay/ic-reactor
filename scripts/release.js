#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execFileSync } from "child_process"
import {
  AI_CONTEXT_FILES,
  RUNTIME_PLUGIN_MANIFESTS,
} from "./ai-context-files.js"
import {
  syncAiContextVersions,
  syncPluginManifestVersions,
} from "./sync-ai-context-versions.js"
import { releasePrSteps } from "./lib/release-pr-steps.mjs"
import { releaseFor } from "./release-tag.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

// Get version from CLI arg
const [requested, ...extraArgs] = process.argv.slice(2)

if (!requested) {
  console.error("Please provide a version: node scripts/release.js 4.0.0")
  process.exit(1)
}

// The script used to take --dry-run and --publish. Refused before any file
// changes: a release publishes only through release.yml, after its preflight
// and the npm-publish approval, with provenance (#969).
if (extraArgs.length > 0) {
  console.error(
    `Refusing ${extraArgs.join(" ")}: release.js takes only a version. It makes the release commit, and release.yml publishes from the tag on the release pull request's merge commit.`
  )
  process.exit(1)
}

// A 4.x version only, checked by the same rules as release.yml's preflight
// (scripts/release-tag.mjs): a stable version publishes under `latest`, a
// prerelease under `beta`. 3.x releases are made on the v3 branch.
let release
try {
  release = releaseFor(requested)
} catch (error) {
  console.error(`Refusing ${requested}: ${error.message}`)
  process.exit(1)
}
// Without a leading `v`: `v4.0.0` and `4.0.0` release the same version.
const version = release.version

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: rootDir, ...options })
}

function updatePackageJson(filePath, newVersion) {
  try {
    const fullPath = join(rootDir, filePath)
    const pkg = JSON.parse(readFileSync(fullPath, "utf-8"))
    pkg.version = newVersion
    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`✅ Updated ${filePath} to ${newVersion}`)
  } catch (err) {
    console.error(`❌ Failed to update ${filePath}: ${err.message}`)
    process.exit(1)
  }
}

// The version being replaced. Captured before any file is rewritten so the
// AI-context sync below can target exactly that string. core, react and
// vite-plugin release in lockstep on this line.
const previousVersion = JSON.parse(
  readFileSync(join(rootDir, "packages/core/package.json"), "utf-8")
).version

console.log(`\n🚀 Starting release process for v${version}...\n`)

// 1. Update library versions
updatePackageJson("package.json", version)
updatePackageJson("packages/core/package.json", version)
updatePackageJson("packages/react/package.json", version)
updatePackageJson("packages/vite-plugin/package.json", version)

// 2. Regenerate packages/core/src/version.ts from the bumped package.json.
//    `version:sync` normally runs only as part of core's `build`, which a
//    release never invokes, so without this the committed VERSION would keep
//    reporting the previous release even though the path is staged below.
console.log("\n🔢 Regenerating core version constant...")
try {
  run("pnpm", ["--filter", "@ic-reactor/core", "version:sync"])
} catch (error) {
  console.error("❌ Failed to regenerate packages/core/src/version.ts")
  process.exit(1)
}

// 3. Sync every AI-context file the check:ai-context gate reads
console.log("\n🧠 Syncing AI-context versions...")
const syncedFiles = syncAiContextVersions(rootDir, previousVersion, version, [
  "@ic-reactor/core",
  "@ic-reactor/react",
  "@ic-reactor/vite-plugin",
])
syncedFiles.forEach((f) => console.log(`✅ Synced ${f} to ${version}`))

// The Claude Code plugin that installs the consumer skill carries the runtime
// version; installed copies update only when it changes.
syncPluginManifestVersions(rootDir, version).forEach((f) =>
  console.log(`✅ Set ${f} to ${version}`)
)

// 4. Sync examples to literal version for the Git Commit (StackBlitz support)
try {
  console.log("\n📦 Syncing examples to literal version for StackBlitz...")
  run("node", ["scripts/sync-example-versions.js", version])
} catch (error) {
  // An example the sync could not update keeps the previous release's ranges,
  // and the commit below would ship them, so stop here as release-tools.js does.
  console.error("❌ Failed to sync example versions.")
  process.exit(1)
}

// 5. Update the lockfile LAST. Running it before the example sync leaves the
//    lockfile describing the previous literal versions, and CI installs with
//    --frozen-lockfile, so the release commit fails to install.
console.log("\n🔗 Updating lockfile (pnpm install)...")
try {
  run("pnpm", ["install", "--no-frozen-lockfile"])
} catch (error) {
  console.error("❌ pnpm install failed.")
  process.exit(1)
}

const RELEASE_PATHS = [
  // Every file syncAiContextVersions() may rewrite; without them the bumps are
  // left unstaged and check:ai-context fails on the released commit.
  ...AI_CONTEXT_FILES,
  ...RUNTIME_PLUGIN_MANIFESTS,
  "package.json",
  "pnpm-lock.yaml",
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/vite-plugin/package.json",
  // Regenerated from package.json by core's `version:sync` at build time. It is
  // committed, so without staging it here the repo keeps reporting the previous
  // release's VERSION even though the published artifact is correct.
  "packages/core/src/version.ts",
  "examples",
]

// 6. Git commit. No tag: the release is tagged on the merge commit of its pull
//    request, which is what release.yml publishes from.
console.log("\n📂 Creating release commit...")
try {
  // `-u` stages modifications to already-tracked files only, so no untracked
  // scratch file can be swept in -- `git add .` would have put one in the
  // release, and in its packages, since core and react ship "src". It also
  // keeps `examples` safe to pass as a directory: sync-example-versions.js only
  // rewrites package.json files under it, at either workspace depth, but an
  // untracked file sitting there must never ride along.
  run("git", ["add", "-u", "--", ...RELEASE_PATHS])
  run("git", ["commit", "-m", `chore: release v${version}`])
} catch (error) {
  console.error("❌ Git operations failed:", error.message)
  process.exit(1)
}

console.log(`\n🎉 Prepared release v${version}.\n`)
console.log(releasePrSteps(version))
