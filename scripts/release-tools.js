#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execFileSync } from "child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

// Get version from CLI arg
const version = process.argv[2]
const shouldPublish = process.argv.includes("--publish")
const dryRun = process.argv.includes("--dry-run")

if (!version || version.startsWith("--")) {
  console.error("Please provide a version: node scripts/release-tools.js 0.1.0")
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
// elsewhere (the package tables in AGENTS.md/CLAUDE.md, the lane lines in
// .cursorrules and skill-packages/README.md, ...) were left behind and failed
// the check:ai-context CI gate on the release commit itself.
//
// `scripts/release.js` has carried this fix for the runtime lane for a while;
// this lane never got it, so every tools release broke the gate on main.
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
  "packages/codegen/llms.txt",
  "packages/cli/llms.txt",
  "packages/vite-plugin/llms.txt",
]

function syncAiContextVersions(oldVersion, newVersion) {
  if (oldVersion === newVersion) return
  // Same boundaries as check-ai-context.js's SEMVER, so `0.12.0` inside
  // `0.12.01` or a longer dotted string is not touched. Matches an optional
  // leading `v`.
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

console.log(`\n🚀 Starting TOOLS release process for v${version}...\n`)

// 1. Update tool package versions
const packages = [
  "packages/codegen/package.json",
  "packages/vite-plugin/package.json",
  "packages/cli/package.json",
]

// Read the outgoing version before any manifest is rewritten, so prose mentions
// of it can be swept afterwards.
const previousVersion = JSON.parse(
  readFileSync(join(rootDir, packages[0]), "utf-8")
).version

packages.forEach((pkg) => updatePackageJson(pkg, version))

syncAiContextVersions(previousVersion, version)

// 2. Update library lockfile
console.log("\n🔗 Updating lockfile (pnpm install)...")
try {
  // We need to update the lockfile because versions changed
  run("pnpm", ["install", "--no-frozen-lockfile"])
} catch (error) {
  console.error("❌ pnpm install failed.")
  process.exit(1)
}

const RELEASE_PATHS = [
  // updateLlmsVersion() and syncAiContextVersions() rewrite these; without them
  // here the bump is left unstaged and check:ai-context fails on the released
  // commit.
  ...AI_CONTEXT_FILES,
  "pnpm-lock.yaml",
  "packages/codegen/package.json",
  "packages/vite-plugin/package.json",
  "packages/cli/package.json",
  "packages/parser/package.json",
  "packages/codegen/llms.txt",
  "packages/vite-plugin/llms.txt",
  "packages/cli/llms.txt",
  "examples",
]

// 3. Git Commit and Tag
console.log("\n📂 Creating release commit and tag...")
const tagName = `tools-v${version}`

try {
  // `-u` stages modifications to already-tracked files only, so no untracked
  // scratch file can be swept in -- `git add .` would have committed, tagged and
  // published one, since core/react/candid ship "src". It also keeps `examples`
  // safe to pass as a directory: sync-example-versions.js only rewrites
  // package.json files under it, at either workspace depth, but an untracked file
  // sitting there must never ride along.
  run("git", ["add", "-u", "--", ...RELEASE_PATHS])
  run("git", ["commit", "-m", `chore: release tools v${version}`])

  // Tagging
  try {
    run("git", ["tag", "-d", tagName], { stdio: "ignore" })
  } catch (e) {}

  run("git", ["tag", tagName])
  console.log(`✅ Tagged ${tagName}`)
} catch (error) {
  console.error("❌ Git operations failed:", error.message)
  process.exit(1)
}

// 4. Publish to npm
if (shouldPublish || dryRun) {
  console.log(`\n📤 Publishing tools to npm${dryRun ? " (DRY RUN)" : ""}...`)
  try {
    const filterArgs = packages.flatMap((p) => ["--filter", `./${dirname(p)}`])

    // --no-git-checks because we just committed/tagged but haven't pushed yet
    const publishArgs = [
      ...filterArgs,
      "publish",
      "--no-git-checks",
      "--access",
      "public",
    ]
    // A hyphen means a prerelease; publishing it to `latest` would hand it to
    // every plain `npm install`.
    if (version.includes("-")) publishArgs.push("--tag", "beta")
    if (dryRun) publishArgs.push("--dry-run")

    console.log(`Running: pnpm ${publishArgs.join(" ")}\n`)
    run("pnpm", publishArgs)
    console.log("\n✅ Tools published successfully!")
  } catch (error) {
    console.error("\n❌ Publish failed:", error.message)
    process.exit(1)
  }
} else {
  console.log(`\n🎉 Successfully prepared tools release v${version}!`)
  console.log(`\nTo publish, run:`)
  console.log(`  node scripts/release-tools.js ${version} --dry-run`)
  console.log(`  node scripts/release-tools.js ${version} --publish`)
  console.log(`\nDon't forget to push:`)
  console.log(`  git push origin main ${tagName}`)
}
