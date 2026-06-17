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

console.log(`\n🚀 Starting TOOLS release process for v${version}...\n`)

// 1. Update tool package versions
const packages = [
  "packages/codegen/package.json",
  "packages/vite-plugin/package.json",
  "packages/cli/package.json",
]

packages.forEach((pkg) => updatePackageJson(pkg, version))

// 2. Update library lockfile
console.log("\n🔗 Updating lockfile (pnpm install)...")
try {
  // We need to update the lockfile because versions changed
  run("pnpm", ["install", "--no-frozen-lockfile"])
} catch (error) {
  console.error("❌ pnpm install failed.")
  process.exit(1)
}

// 3. Git Commit and Tag
console.log("\n📂 Creating release commit and tag...")
const tagName = `tools-v${version}`

try {
  run("git", ["add", "."])
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
