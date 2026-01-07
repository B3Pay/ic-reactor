#!/usr/bin/env node
/**
 * Sync IC Reactor package versions in all examples.
 *
 * Usage:
 *   node scripts/sync-example-versions.js           # Uses version from root package.json
 *   node scripts/sync-example-versions.js 3.0.0    # Uses specified version
 *   node scripts/sync-example-versions.js workspace # Sets to workspace:*
 *
 * This script updates all @ic-reactor/* dependencies in examples
 * to match the current published version, ensuring StackBlitz compatibility.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")
const examplesDir = join(rootDir, "examples")

// Get version from CLI arg or root package.json
const cliVersion = process.argv[2]
const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"))

let targetVersion
if (cliVersion === "workspace") {
  targetVersion = "workspace:*"
} else {
  const v = cliVersion || rootPkg.version
  targetVersion = v.startsWith("^") ? v : `^${v}`
}

console.log(`\n📦 Syncing @ic-reactor/* to version: ${targetVersion}\n`)

// IC Reactor packages to update
const packages = ["@ic-reactor/core", "@ic-reactor/react", "@ic-reactor/candid"]

// Get all example directories
const examples = readdirSync(examplesDir).filter((name) => {
  const path = join(examplesDir, name)
  try {
    return (
      statSync(path).isDirectory() &&
      statSync(join(path, "package.json")).isFile()
    )
  } catch (e) {
    return false
  }
})

let updatedCount = 0

for (const example of examples) {
  const pkgPath = join(examplesDir, example, "package.json")

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    let modified = false

    for (const pkgName of packages) {
      // Check dependencies
      if (pkg.dependencies?.[pkgName]) {
        if (pkg.dependencies[pkgName] !== targetVersion) {
          console.log(
            `  ✓ ${example}: ${pkgName} ${pkg.dependencies[pkgName]} → ${targetVersion}`
          )
          pkg.dependencies[pkgName] = targetVersion
          modified = true
        }
      }

      // Check devDependencies
      if (pkg.devDependencies?.[pkgName]) {
        if (pkg.devDependencies[pkgName] !== targetVersion) {
          console.log(
            `  ✓ ${example}: ${pkgName} ${pkg.devDependencies[pkgName]} → ${targetVersion}`
          )
          pkg.devDependencies[pkgName] = targetVersion
          modified = true
        }
      }
    }

    if (modified) {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
      updatedCount++
    }
  } catch (err) {
    console.error(`  ✗ ${example}: ${err.message}`)
  }
}

console.log(`\n✅ Updated ${updatedCount} example(s)\n`)

if (updatedCount > 0) {
  console.log("Next steps:")
  console.log("  1. Run 'pnpm install' to update lockfile")
  console.log("  2. Commit the changes")
  console.log("  3. Push to make StackBlitz examples work\n")
}
