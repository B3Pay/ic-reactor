#!/usr/bin/env node
/**
 * Sync IC Reactor package versions in all examples.
 *
 * Usage:
 *   node scripts/sync-example-versions.js           # Uses versions from local package.json files
 *   node scripts/sync-example-versions.js 3.0.0    # Uses specified version
 *   node scripts/sync-example-versions.js workspace # Sets to workspace:*
 *
 * This script updates all @ic-reactor/* dependencies in examples
 * to match the current local package versions, ensuring StackBlitz compatibility.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, dirname, relative } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")
const examplesDir = join(rootDir, "examples")

// Get version from CLI arg or local package.json files
const cliVersion = process.argv[2]

// IC Reactor packages to update
const packages = [
  "@ic-reactor/core",
  "@ic-reactor/react",
  "@ic-reactor/auth",
  "@ic-reactor/auth-react",
  "@ic-reactor/candid",
  "@ic-reactor/cli",
  "@ic-reactor/codegen",
  "@ic-reactor/parser",
  "@ic-reactor/vite-plugin",
]

const packageVersions = new Map(
  readdirSync(join(rootDir, "packages"))
    .map((name) => join(rootDir, "packages", name, "package.json"))
    .filter((path) => {
      try {
        return statSync(path).isFile()
      } catch (e) {
        return false
      }
    })
    .map((path) => JSON.parse(readFileSync(path, "utf-8")))
    .filter((pkg) => packages.includes(pkg.name))
    .map((pkg) => [pkg.name, pkg.version])
)

const targetVersionFor = (pkgName) => {
  if (cliVersion === "workspace") return "workspace:*"

  const v = cliVersion || packageVersions.get(pkgName)
  if (!v) throw new Error(`Missing local package version for ${pkgName}`)

  return v.startsWith("^") ? v : `^${v}`
}

console.log(`\n📦 Syncing @ic-reactor/* example dependencies\n`)

function findExamplePackageJsonFiles(dir) {
  const ignored = new Set(["node_modules", "dist", ".next", "out"])
  const packageJsonFiles = []

  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue

    const entryPath = join(dir, entry)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      packageJsonFiles.push(...findExamplePackageJsonFiles(entryPath))
    } else if (entry === "package.json") {
      packageJsonFiles.push(entryPath)
    }
  }

  return packageJsonFiles
}

const packageJsonFiles = findExamplePackageJsonFiles(examplesDir)

let updatedCount = 0

for (const pkgPath of packageJsonFiles) {
  const example = dirname(relative(examplesDir, pkgPath))

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    let modified = false

    for (const pkgName of packages) {
      const targetVersion = targetVersionFor(pkgName)

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
