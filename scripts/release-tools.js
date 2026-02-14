#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

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
  execSync("pnpm install --no-frozen-lockfile", {
    stdio: "inherit",
    cwd: rootDir,
  })
} catch (error) {
  console.error("❌ pnpm install failed.")
  process.exit(1)
}

// 3. Git Commit and Tag
console.log("\n📂 Creating release commit and tag...")
const tagName = `tools-v${version}`

try {
  execSync("git add .", { stdio: "inherit", cwd: rootDir })
  execSync(`git commit -m "chore: release tools v${version}"`, {
    stdio: "inherit",
    cwd: rootDir,
  })

  // Tagging
  try {
    execSync(`git tag -d ${tagName}`, { stdio: "ignore", cwd: rootDir })
  } catch (e) {}

  execSync(`git tag ${tagName}`, { stdio: "inherit", cwd: rootDir })
  console.log(`✅ Tagged ${tagName}`)
} catch (error) {
  console.error("❌ Git operations failed:", error.message)
  process.exit(1)
}

// 4. Publish to npm
if (shouldPublish || dryRun) {
  console.log(`\n📤 Publishing tools to npm${dryRun ? " (DRY RUN)" : ""}...`)
  try {
    const filterArgs = packages
      .map((p) => `--filter "./${dirname(p)}"`)
      .join(" ")

    // --no-git-checks because we just committed/tagged but haven't pushed yet
    const publishCmd = `pnpm ${filterArgs} publish --no-git-checks --access public${
      dryRun ? " --dry-run" : ""
    }`

    console.log(`Running: ${publishCmd}\n`)
    execSync(publishCmd, { stdio: "inherit", cwd: rootDir })
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
