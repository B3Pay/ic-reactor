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
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative } from "node:path"
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

if (pkg === "parser") {
  console.error(
    "parser is not supported: its tests import the built `dist/nodejs` WASM\n" +
      "artifact, so reverting `src/lib.rs` changes nothing that the tests load.\n" +
      "Both passes would run the same binary and every test would look\n" +
      "non-discriminating. Rebuild and compare by hand instead."
  )
  process.exit(1)
}

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
      // Keep the status verbatim. Collapsing it to a boolean made every
      // skipped or todo test look like a failure, and this repo has both.
      results.set(t.fullName ?? t.title, t.status)
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

/**
 * The caller's staged changes under the source trees, as a patch.
 *
 * `git checkout <base> -- <paths>` overwrites those index entries, and the
 * `git reset` that undoes it resets them to HEAD — silently discarding whatever
 * the caller had staged, including a partial-staging selection. Captured here
 * and re-applied on the way out.
 */
const stagedPatch = (() => {
  try {
    const diff = execFileSync(
      "git",
      ["diff", "--cached", "--binary", "--", ...sourcePaths],
      { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
    return diff.trim() ? diff : undefined
  } catch {
    return undefined
  }
})()

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
    if (stagedPatch) {
      const patchFile = join(backupDir, "staged.patch")
      writeFileSync(patchFile, stagedPatch)
      execFileSync("git", ["apply", "--cached", patchFile], { cwd: rootDir })
    }
  } catch {
    console.error(
      "\n⚠ Could not fully restore the git index for the source paths.\n" +
        `    git reset -- ${sourcePaths.join(" ")}\n` +
        (stagedPatch ? "    (your staged changes may need re-staging)\n" : "")
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
const colocatedTestsBefore = colocatedTests()

/** Every colocated test file under the reverted source trees. */
function colocatedTests() {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) found.push(full)
    }
  }
  for (const rel of sourcePaths) walk(join(rootDir, rel))
  return found
}

console.log(`→ reverting sources to ${base} and re-running…`)
try {
  git("checkout", base, "--", ...sourcePaths)
  // Some packages colocate tests under `src` (codegen does). Checking out the
  // whole tree would swap those for their base versions — or delete ones the
  // branch adds — so the tests being judged would not be the ones written.
  // Put them back from the copy taken a moment ago.
  for (const rel of sourcePaths) {
    const srcRoot = join(rootDir, rel)
    const savedRoot = join(backupDir, rel.replaceAll("/", "__"))
    for (const abs of colocatedTestsBefore) {
      if (!abs.startsWith(`${srcRoot}/`)) continue
      const saved = join(savedRoot, relative(srcRoot, abs))
      if (!existsSync(saved)) continue
      mkdirSync(dirname(abs), { recursive: true })
      cpSync(saved, abs)
    }
  }
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
const failingNow = []
const skipped = []

for (const [name, statusAfter] of after) {
  const statusBefore = before.get(name)
  if (statusAfter === "failed") failingNow.push(name)
  else if (statusAfter !== "passed") skipped.push(name)
  // Only an outright failure on the base counts as evidence. A test that was
  // skipped there says nothing either way.
  else if (statusBefore === "failed") discriminating.push(name)
  else bothPass.push(name)
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

if (failingNow.length) {
  console.log(`\n${pad(failingNow.length)} failing now       (fix these first)`)
  for (const n of failingNow) console.log(`      ✗ ${n}`)
}

if (skipped.length) {
  console.log(
    `\n${pad(skipped.length)} skipped            (not evidence either way)`
  )
  for (const n of skipped) console.log(`      – ${n}`)
}

console.log("")
if (failingNow.length) process.exit(1)
if (discriminating.length === 0 && bothPass.length === 0 && skipped.length) {
  console.log("Every test here is skipped, so this run proves nothing.\n")
  process.exit(2)
}
if (discriminating.length === 0) {
  console.log(
    "No test in this file distinguishes the fix. That is correct for a pure\n" +
      "refactor or a file of invariant guards — otherwise the fix is untested.\n"
  )
  process.exit(2)
}
process.exit(0)
