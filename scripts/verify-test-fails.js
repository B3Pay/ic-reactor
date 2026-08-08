#!/usr/bin/env node
/**
 * Does this test actually catch the bug it was written for?
 *
 * Reverts package sources to a base revision, re-runs the given tests against
 * that older code, and reports which ones flipped. A test that passes both with
 * and without the fix proves nothing about the fix — it is either an invariant
 * guard (fine, and worth having) or vacuous (not fine, and easy to write by
 * accident: an inline closure that changes a memo dependency every render, or a
 * fixture that never reaches the state the defect lives in).
 *
 * Usage
 *   node scripts/verify-test-fails.js <vitest-file-pattern> [options]
 *
 *   --package <name>   workspace package to run in     (default: auto-detected)
 *   --base <ref>       revision to revert sources to   (default: main)
 *   --keep             leave the reverted sources in place (debugging)
 *
 * Example
 *   node scripts/verify-test-fails.js tests/retry-classification.test.ts --package core
 *
 * Sources are copied aside and restored from that copy rather than via git
 * stash, so an interrupted run cannot leave conflict markers behind.
 */
import { execFileSync, spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")

const args = process.argv.slice(2)
const VALUE_FLAGS = new Set(["--package", "--base"])
const BOOL_FLAGS = new Set(["--keep"])

const options = {}
const positional = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (VALUE_FLAGS.has(arg)) options[arg.slice(2)] = args[++i]
  else if (BOOL_FLAGS.has(arg)) options[arg.slice(2)] = true
  else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  } else positional.push(arg)
}

const flag = (name, fallback) => options[name] ?? fallback
const pattern = positional[0]
const base = flag("base", "main")
const keep = Boolean(flag("keep", false))

if (!pattern) {
  console.error(
    "Usage: node scripts/verify-test-fails.js <test-file> [--package <name>] [--base <ref>]"
  )
  process.exit(1)
}

const packagesDir = join(rootDir, "packages")
const allPackages = readdirSync(packagesDir).filter((p) =>
  existsSync(join(packagesDir, p, "package.json"))
)

/** Which package owns the test file, if the caller did not say. */
function detectPackage() {
  const named = flag("package")
  if (named) return named
  for (const p of allPackages) {
    if (existsSync(join(packagesDir, p, pattern))) return p
  }
  console.error(
    `Could not tell which package "${pattern}" belongs to. Pass --package <name>.`
  )
  process.exit(1)
}

const pkg = detectPackage()
const pkgDir = join(packagesDir, pkg)

function git(...a) {
  return execFileSync("git", a, { cwd: rootDir, encoding: "utf8" }).trim()
}

/**
 * Run the tests and return a map of test name -> passed.
 *
 * A non-zero exit is expected on the "before" run, so the exit code is ignored
 * in favour of the JSON report.
 */
function runTests(label) {
  const reportPath = join(mkdtempSync(join(tmpdir(), "vtf-")), "report.json")
  spawnSync(
    "./node_modules/.bin/vitest",
    ["run", pattern, "--reporter=json", "--outputFile", reportPath],
    { cwd: pkgDir, encoding: "utf8", stdio: "ignore" }
  )
  if (!existsSync(reportPath)) {
    console.error(
      `\n✖ ${label}: vitest produced no report — is the path right?`
    )
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const results = new Map()
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      results.set(t.fullName ?? t.title, t.status === "passed")
    }
  }
  return results
}

// Sources are what we revert; tests stay exactly as written.
const sourcePaths = allPackages
  .map((p) => join("packages", p, "src"))
  .filter((rel) => existsSync(join(rootDir, rel)))

const backupDir = mkdtempSync(join(tmpdir(), "verify-test-fails-"))
let restored = false

function restore() {
  if (restored || keep) return
  restored = true
  for (const rel of sourcePaths) {
    const saved = join(backupDir, rel.replaceAll("/", "__"))
    if (!existsSync(saved)) continue
    rmSync(join(rootDir, rel), { recursive: true, force: true })
    cpSync(saved, join(rootDir, rel), { recursive: true })
  }
  // `git checkout <base> -- <paths>` writes the base content to the index as
  // well as the worktree. Putting the files back leaves the index still holding
  // the base version, which shows up as staged changes and could be committed
  // by accident — so unstage those paths too.
  try {
    execFileSync("git", ["reset", "-q", "--", ...sourcePaths], { cwd: rootDir })
  } catch {
    console.error(
      "\n⚠ Could not unstage the reverted paths. Run:\n" +
        `    git reset -- ${sourcePaths.join(" ")}\n`
    )
  }
  rmSync(backupDir, { recursive: true, force: true })
}

// Restore on any exit path, including Ctrl-C.
process.on("exit", restore)
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(1))

console.log(`\nverify-test-fails`)
console.log(`  package : ${pkg}`)
console.log(`  tests   : ${pattern}`)
console.log(`  base    : ${base}\n`)

console.log("→ running against the current sources…")
const after = runTests("current")
if (after.size === 0) {
  console.error("✖ No tests matched — check the path.")
  process.exit(1)
}

for (const rel of sourcePaths) {
  cpSync(join(rootDir, rel), join(backupDir, rel.replaceAll("/", "__")), {
    recursive: true,
  })
}

console.log(`→ reverting sources to ${base} and re-running…`)
try {
  git("checkout", base, "--", ...sourcePaths)
} catch (error) {
  console.error(
    `✖ Could not check out sources from "${base}": ${error.message}`
  )
  process.exit(1)
}
const before = runTests("base")
restore()

// ── report ────────────────────────────────────────────────────────────────
const discriminating = []
const bothPass = []
const bothFail = []

for (const [name, passedAfter] of after) {
  const passedBefore = before.get(name)
  if (passedAfter && passedBefore === false) discriminating.push(name)
  else if (passedAfter && passedBefore !== false) bothPass.push(name)
  else if (!passedAfter) bothFail.push(name)
}

const pad = (n) => String(n).padStart(3)
console.log(
  `\n${pad(discriminating.length)} caught the bug   (fail on ${base}, pass now)`
)
for (const n of discriminating) console.log(`      ✓ ${n}`)

if (bothPass.length) {
  console.log(
    `\n${pad(bothPass.length)} passed either way  (invariant guards, or vacuous — check each)`
  )
  for (const n of bothPass) console.log(`      • ${n}`)
}

if (bothFail.length) {
  console.log(`\n${pad(bothFail.length)} failing now       (fix these first)`)
  for (const n of bothFail) console.log(`      ✗ ${n}`)
}

console.log("")
if (bothFail.length) process.exit(1)
if (discriminating.length === 0) {
  console.log(
    "No test in this file distinguishes the fix. That is correct for a pure\n" +
      "refactor or a file of invariant guards — otherwise the fix is untested.\n"
  )
  process.exit(2)
}
process.exit(0)
