#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execFileSync } from "child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

// Get version from CLI arg
const version = process.argv[2]

if (!version) {
  console.error(
    "Please provide a version: node scripts/release.js 3.0.0-beta.3"
  )
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: rootDir, ...options })
}

function updateLlmsVersion(packageName, newVersion) {
  try {
    const llmsPath = join(rootDir, "llms.txt")
    let llmsText = readFileSync(llmsPath, "utf-8")
    const escapedPackage = packageName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
    const regex = new RegExp(`(- \`${escapedPackage}\`: \`)[^\`]+(\`)`)
    llmsText = llmsText.replace(regex, `$1${newVersion}$2`)
    writeFileSync(llmsPath, llmsText, "utf-8")
    console.log(`✅ Updated ${packageName} in llms.txt to ${newVersion}`)
  } catch (err) {
    console.error(
      `❌ Failed to update llms.txt for ${packageName}: ${err.message}`
    )
  }
}

// Every file `scripts/check-ai-context.js` verifies. `updateLlmsVersion` only
// rewrites the backticked version table in the root llms.txt, so prose mentions
// elsewhere ("targets the stable v3.8.0 runtime release", the package tables in
// AGENTS.md/CLAUDE.md, ...) were left behind and failed the check:ai-context CI
// gate on the release commit itself.
const AI_CONTEXT_FILES = [
  "llms.txt",
  "llms-full.txt",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "skill-packages/README.md",
  "skill-packages/ic-reactor-hooks/SKILL.md",
  "skill-packages/ic-reactor-packages/SKILL.md",
  "skill-packages/ic-reactor-packages/references/package-map.md",
  "packages/core/llms.txt",
  "packages/react/llms.txt",
  "packages/candid/llms.txt",
]

function syncAiContextVersions(oldVersion, newVersion) {
  if (oldVersion === newVersion) return
  // Same boundaries as check-ai-context.js's SEMVER, so `3.9.0` inside `3.9.01`
  // or a longer dotted string is not touched. Matches an optional leading `v`.
  const escaped = oldVersion.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
  const pattern = new RegExp(`(?<![\\d.])(v?)${escaped}(?![\\d.]\\d)`, "g")

  for (const relativePath of AI_CONTEXT_FILES) {
    const fullPath = join(rootDir, relativePath)
    let text
    try {
      text = readFileSync(fullPath, "utf-8")
    } catch {
      continue // optional file
    }
    const updated = text.replace(pattern, `$1${newVersion}`)
    if (updated !== text) {
      writeFileSync(fullPath, updated, "utf-8")
      console.log(`✅ Synced ${relativePath} to ${newVersion}`)
    }
  }
}

function updatePackageJson(filePath, newVersion) {
  try {
    const fullPath = join(rootDir, filePath)
    const pkg = JSON.parse(readFileSync(fullPath, "utf-8"))
    pkg.version = newVersion
    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`✅ Updated ${filePath} to ${newVersion}`)
    if (pkg.name && pkg.name.startsWith("@ic-reactor/")) {
      updateLlmsVersion(pkg.name, newVersion)
    }
  } catch (err) {
    console.error(`❌ Failed to update ${filePath}: ${err.message}`)
    process.exit(1)
  }
}

// The runtime version being replaced. Captured before any file is rewritten so
// the AI-context sync below can target exactly that string and leave the
// independently-versioned tooling (codegen, cli, vite-plugin, parser) alone.
const previousVersion = JSON.parse(
  readFileSync(join(rootDir, "packages/core/package.json"), "utf-8")
).version

console.log(`\n🚀 Starting release process for v${version}...\n`)

// 1. Update library versions
updatePackageJson("package.json", version)
updatePackageJson("packages/core/package.json", version)
updatePackageJson("packages/react/package.json", version)
updatePackageJson("packages/candid/package.json", version)

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
syncAiContextVersions(previousVersion, version)

// 4. Sync examples to literal version for the Git Commit (StackBlitz support)
try {
  console.log("\n📦 Syncing examples to literal version for StackBlitz...")
  run("node", ["scripts/sync-example-versions.js", version])
} catch (error) {
  console.error("❌ Failed to sync example versions")
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
  "package.json",
  "pnpm-lock.yaml",
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/candid/package.json",
  // Regenerated from package.json by core's `version:sync` at build time. It is
  // committed, so without staging it here the repo keeps reporting the previous
  // release's VERSION even though the published artifact is correct.
  "packages/core/src/version.ts",
  "examples",
]

// 6. Git Commit and Tag
console.log("\n📂 Creating release commit and tag...")
try {
  // `-u` stages modifications to already-tracked files only, so no untracked
  // scratch file can be swept in -- `git add .` would have committed, tagged and
  // published one, since core/react/candid ship "src". It also keeps `examples`
  // safe to pass as a directory: sync-example-versions.js only rewrites
  // package.json files under it, at either workspace depth, but an untracked file
  // sitting there must never ride along.
  run("git", ["add", "-u", "--", ...RELEASE_PATHS])
  run("git", ["commit", "-m", `chore: release v${version}`])

  try {
    run("git", ["tag", "-d", `v${version}`], { stdio: "ignore" })
  } catch (e) {}

  run("git", ["tag", `v${version}`])
} catch (error) {
  console.error("❌ Git operations failed:", error.message)
  process.exit(1)
}

// 7. Publish to npm (pnpm -r publish automatically converts workspace:^ to real versions)
const shouldPublish = process.argv.includes("--publish")
const dryRun = process.argv.includes("--dry-run")

if (shouldPublish || dryRun) {
  console.log(`\n📤 Publishing to npm${dryRun ? " (DRY RUN)" : ""}...`)
  try {
    // Publish runtime libraries together; parser, docs, e2e, and tooling use separate workflows.
    const publishArgs = [
      "--filter",
      "@ic-reactor/core",
      "--filter",
      "@ic-reactor/react",
      "--filter",
      "@ic-reactor/candid",
      "publish",
      "--no-git-checks",
      "--access",
      "public",
    ]
    // A hyphen means a prerelease (3.8.0-beta.1). Publishing that to `latest` would
    // hand it to every plain `npm install`.
    if (version.includes("-")) publishArgs.push("--tag", "beta")
    if (dryRun) publishArgs.push("--dry-run")
    console.log(`Running: pnpm ${publishArgs.join(" ")}\n`)
    run("pnpm", publishArgs)
    console.log("\n✅ Published successfully!")
  } catch (error) {
    console.error("\n❌ Publish failed:", error.message)
    process.exit(1)
  }
} else {
  console.log(`\n🎉 Successfully prepared release v${version}!`)
  console.log(`\nTo publish, run one of:`)
  console.log(`  node scripts/release.js ${version} --dry-run  # Test first`)
  console.log(
    `  node scripts/release.js ${version} --publish  # Publish to npm`
  )
}

console.log(`\nGit commands:`)
console.log(`  git push origin main --tags`)
