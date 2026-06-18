#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const rootDir = process.cwd()

const versionChecks = [
  { packageName: "@ic-reactor/core", packageDir: "core" },
  { packageName: "@ic-reactor/react", packageDir: "react" },
  { packageName: "@ic-reactor/candid", packageDir: "candid" },
  { packageName: "@ic-reactor/codegen", packageDir: "codegen" },
  { packageName: "@ic-reactor/cli", packageDir: "cli" },
  { packageName: "@ic-reactor/vite-plugin", packageDir: "vite-plugin" },
  { packageName: "@ic-reactor/parser", packageDir: "parser" },
]

const requiredPackageLlms = [
  "core",
  "react",
  "candid",
  "codegen",
  "cli",
  "vite-plugin",
]

const llmsPath = join(rootDir, "llms.txt")
const llmsText = readFileSync(llmsPath, "utf8")

const failures = []

for (const { packageName, packageDir } of versionChecks) {
  const pkgPath = join(rootDir, "packages", packageDir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  const expectedLine = `- \`${packageName}\`: \`${pkg.version}\``

  if (!llmsText.includes(expectedLine)) {
    failures.push(
      `llms.txt is missing or out of date for ${packageName}. Expected line: ${expectedLine}`
    )
  }
}

for (const packageDir of requiredPackageLlms) {
  const packageLlmsPath = join(rootDir, "packages", packageDir, "llms.txt")
  if (!existsSync(packageLlmsPath)) {
    failures.push(`Missing package AI guide: packages/${packageDir}/llms.txt`)
  }
}

if (failures.length > 0) {
  console.error("AI context check failed:\n")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("AI context check passed.")
