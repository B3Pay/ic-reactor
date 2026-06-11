#!/usr/bin/env node
import { rmSync, readdirSync, statSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")

const ignoreDirs = new Set([".git"])

function findNodeModules(dir, list = []) {
  let files
  try {
    files = readdirSync(dir)
  } catch (err) {
    // Skip if directory cannot be read (e.g. permission issues)
    return list
  }

  for (const file of files) {
    const fullPath = join(dir, file)
    let stat
    try {
      stat = statSync(fullPath)
    } catch (err) {
      continue
    }

    if (stat.isDirectory()) {
      if (file === "node_modules") {
        list.push(fullPath)
      } else if (!ignoreDirs.has(file)) {
        findNodeModules(fullPath, list)
      }
    }
  }
  return list
}

console.log(`Searching for node_modules in: ${rootDir}...`)
const targets = findNodeModules(rootDir)

if (targets.length === 0) {
  console.log("No node_modules folders found.")
  process.exit(0)
}

console.log(`Found ${targets.length} node_modules directories to delete:`)
for (const target of targets) {
  console.log(`- ${target}`)
}

console.log("\nDeleting...")
let deletedCount = 0
for (const target of targets) {
  try {
    rmSync(target, { recursive: true, force: true })
    console.log(`\u2705 Deleted: ${target}`)
    deletedCount++
  } catch (err) {
    console.error(`\u274c Failed to delete ${target}:`, err.message)
  }
}

console.log(
  `\nClean-up complete! Successfully deleted ${deletedCount}/${targets.length} directories.`
)
