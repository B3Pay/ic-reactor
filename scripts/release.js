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

// 1. Update library versions
updatePackageJson("package.json", version)
updatePackageJson("packages/core/package.json", version)
updatePackageJson("packages/react/package.json", version)

// 2. Update library lockfile while examples still point to workspace
console.log("\n🔗 Updating lockfile (pnpm install)...")
try {
  execSync("pnpm install --no-frozen-lockfile", { stdio: "inherit" })
} catch (error) {
  console.error("❌ pnpm install failed.")
  process.exit(1)
}

// 3. Sync examples to literal version for the Git Commit (StackBlitz support)
try {
  console.log("\n📦 Syncing examples to literal version for StackBlitz...")
  execSync(`node scripts/sync-example-versions.js ${version}`, {
    stdio: "inherit",
  })
} catch (error) {
  console.error("❌ Failed to sync example versions")
}

// 4. Git Commit and Tag
console.log("\n📂 Creating release commit and tag...")
try {
  execSync("git add .", { stdio: "inherit" })
  execSync(`git commit -m "chore: release v${version}"`, { stdio: "inherit" })

  try {
    execSync(`git tag -d v${version}`, { stdio: "ignore" })
  } catch (e) {}

  execSync(`git tag v${version}`, { stdio: "inherit" })
} catch (error) {
  console.error("❌ Git operations failed.")
}

// 5. REVERT examples to workspace protocol locally
// This keeps your local environment from breaking on the next 'pnpm install'
console.log("\n🔄 Reverting examples to workspace:* for local development...")
try {
  execSync(`node scripts/sync-example-versions.js workspace`, {
    stdio: "inherit",
  })
  console.log("✅ Local environment is back in 'workspace' mode.")
} catch (error) {
  console.error("❌ Failed to revert examples to workspace mode.")
}

console.log(`\n🎉 Successfully prepared release v${version}!`)
console.log(`\nNext steps:`)
console.log(`  1. Publish to npm: pnpm -r publish --no-git-checks`)
console.log(`  2. Push to git: git push origin main --tags\n`)
console.log(`  3. Delete tag: git tag -d v${version}`)
console.log(`  4. Force push tag: git push origin v${version} --force`)
