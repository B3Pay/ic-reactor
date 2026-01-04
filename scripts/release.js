#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

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

function updatePackageJson(filePath, newVersion) {
  try {
    const fullPath = join(rootDir, filePath)
    const pkg = JSON.parse(readFileSync(fullPath, "utf-8"))
    pkg.version = newVersion
    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`✅ Updated ${filePath} to ${newVersion}`)
  } catch (err) {
    console.error(`❌ Failed to update ${filePath}: ${err.message}`)
  }
}

console.log(`\n🚀 Starting release process for v${version}...\n`)

// 1. Update root package.json
updatePackageJson("package.json", version)

// 2. Update core packages
updatePackageJson("packages/core/package.json", version)
updatePackageJson("packages/react/package.json", version)

// 3. Sync examples versions
// Note: This is optional and usually done after the library is on npm
// for StackBlitz compatibility. pnpm install will fail if version is not on npm.
try {
  console.log("\n📦 Syncing example versions...")
  execSync(`node scripts/sync-example-versions.js ${version}`, {
    stdio: "inherit",
  })
} catch (error) {
  console.warn("⚠️  Warning: Failed to sync example versions")
}

// 4. Update lockfile
console.log("\n🔗 Updating lockfile (pnpm install)...")
try {
  // Use --no-frozen-lockfile to allow updates
  execSync("pnpm install --no-frozen-lockfile", { stdio: "inherit" })
} catch (error) {
  console.warn(
    "\n⚠️  pnpm install failed. This is expected if the new version is not yet published to npm."
  )
  console.warn(
    "The package.json files have been updated, but the lockfile might be out of sync."
  )
}

// 5. Git operations
console.log("\n📂 Committing changes and creating tag...")
try {
  execSync("git add .", { stdio: "inherit" })
  execSync(`git commit -m "chore: release v${version}"`, { stdio: "inherit" })

  // Delete tag if it exists (local only)
  try {
    execSync(`git tag -d v${version}`, { stdio: "ignore" })
  } catch (e) {}

  execSync(`git tag v${version}`, { stdio: "inherit" })
  console.log(`\n🎉 Successfully prepared release v${version}!`)
} catch (error) {
  console.error("❌ Git operations failed. You might need to commit manually.")
}
