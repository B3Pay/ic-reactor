#!/usr/bin/env node
/**
 * Runs each example's real bundler build (`vite build`, `next build`, ...)
 * against the locally built @ic-reactor/* packages. Run `pnpm build` first so
 * the example imports resolve to the freshly built dist + type declarations.
 *
 * This exists because `typecheck-examples.js` only runs `tsc`, and a bundler
 * fails on things the type-checker never looks at: a Turbopack workspace root
 * that puts pnpm's symlinked `node_modules` out of bounds, a Tailwind v3 PostCSS
 * config left behind by a v4 dependency bump, a plugin that no longer resolves.
 * Both of those had been sitting broken in examples/nextjs and
 * examples/nextjs-app-router with green CI (issue #224).
 *
 * Usage: node scripts/build-examples.js
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { SKIP, discoverExampleDirs, examplesDir } from "./example-projects.js"

const dirs = discoverExampleDirs()

const failures = []
const built = []
// A project with no `build` script is a library-style or snippet example with
// nothing to bundle. Recorded rather than silently dropped so the summary line
// stays honest about what was covered.
const noBuildScript = []

for (const name of dirs) {
  const dir = join(examplesDir, name)
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))

  if (!pkg.scripts?.build) {
    noBuildScript.push(name)
    continue
  }

  console.log(`\n▶  Building ${name} (${pkg.scripts.build})`)
  const result = spawnSync("pnpm", ["run", "build"], {
    cwd: dir,
    stdio: "inherit",
    shell: false,
  })
  if (result.status === 0) built.push(name)
  else failures.push(name)
}

if (noBuildScript.length > 0) {
  console.log(`\nℹ️  No build script: ${noBuildScript.join(", ")}`)
}
if (failures.length > 0) {
  console.error(`\n❌ Build failed in: ${failures.join(", ")}`)
  process.exit(1)
}

console.log(
  `\n✅ All ${built.length} buildable examples build cleanly` +
    (SKIP.size > 0 ? ` (skipped by name: ${[...SKIP].join(", ")})` : "")
)
