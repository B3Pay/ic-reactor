#!/usr/bin/env node
/**
 * Proves that the runtime tests listed in `scripts/faults.json` bite.
 *
 * A test that stays green with the bug it exists for put back in the code
 * guards nothing, and nothing in a green build says which tests are those. For
 * every entry of the manifest this script
 *
 * 1. runs the named test against an unmodified copy of the package, and
 *    requires it to pass (a test that fails anyway proves nothing either way),
 * 2. applies the entry's fault (a textual edit, written out) to a fresh copy,
 * 3. runs the same test, and requires at least one assertion to FAIL.
 *
 * The script fails if any listed test passes under its fault. It also fails
 * when a fault no longer applies (the source it names moved), when no test
 * matches, and when the fault made the test file fail to load instead of
 * making an assertion fail: that is a fault that broke the module, not the
 * behaviour the test is about.
 *
 * Faults go into a copy of the package under the system temp directory. The
 * working tree is never written to, so an interrupted run leaves nothing
 * behind to commit. This is the CI counterpart of
 * `scripts/verify-test-fails.js`, which compares a new test against the base
 * revision by hand when a bug is fixed.
 *
 * ## The manifest
 *
 * A JSON array. Each entry:
 *
 *     {
 *       "id": "ir3-management-reject-2",
 *       "package": "core",
 *       "test": "tests/errors.test.ts",
 *       "testName": "reject 2 from the management canister",
 *       "why": "what the fault puts back, and what the test must say about it",
 *       "file": "src/errors.ts",
 *       "search": "const noCodeRan = canisterId !== MANAGEMENT_CANISTER",
 *       "replace": "const noCodeRan = true"
 *     }
 *
 * `package` is a directory name under `packages/`, `test` a path inside it,
 * and `testName` (optional) a vitest `-t` filter, matched literally. For more
 * than one edit, give `"edits": [{ "file", "search", "replace" }, ...]`
 * instead of `file`, `search` and `replace`. Every `search` must occur exactly
 * once in its file.
 *
 * Add an entry with the change that introduces a test whose bug is a
 * regression somebody could reintroduce, and check that the fault is the
 * natural way to reintroduce it.
 *
 * Usage
 *   node scripts/verify-faults.mjs [--manifest <file>] [--only <id>] [--jobs <n>]
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  FaultError,
  applyEdits,
  createWorkspaceCopy,
} from "./lib/fault-workspace.mjs"

/** The manifest's default location. */
export const DEFAULT_MANIFEST = "scripts/faults.json"

/** How long one vitest run may take. */
const RUN_TIMEOUT_MS = 180_000

// ── The manifest ─────────────────────────────────────────────────────────────

/**
 * Reads and checks a manifest.
 *
 * @returns {{ entries: object[], problems: string[] }}
 */
export function loadManifest(path, repoRoot) {
  const problems = []
  let data
  try {
    data = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    return { entries: [], problems: [`${path}: ${error.message}`] }
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { entries: [], problems: [`${path} must be a non-empty array`] }
  }
  const seen = new Set()
  const entries = []
  data.forEach((raw, index) => {
    const label = typeof raw?.id === "string" ? raw.id : `entry ${index}`
    const bad = (message) => problems.push(`${label}: ${message}`)
    if (typeof raw?.id !== "string" || raw.id === "") {
      return bad('needs an "id"')
    }
    if (seen.has(raw.id)) return bad("the id is used twice")
    seen.add(raw.id)
    if (typeof raw.package !== "string" || typeof raw.test !== "string") {
      return bad(
        'needs a "package" (a directory under packages/) and a "test" (a path inside it)'
      )
    }
    if (raw.testName !== undefined && typeof raw.testName !== "string") {
      return bad('"testName" must be text')
    }
    const packageDir = `packages/${raw.package}`
    if (!existsSync(join(repoRoot, packageDir, "package.json"))) {
      return bad(`${packageDir} is not a package`)
    }
    if (!existsSync(join(repoRoot, packageDir, raw.test))) {
      return bad(`${packageDir}/${raw.test} does not exist`)
    }
    const edits =
      raw.edits ??
      (raw.file === undefined
        ? undefined
        : [{ file: raw.file, search: raw.search, replace: raw.replace }])
    if (!Array.isArray(edits) || edits.length === 0) {
      return bad('needs "file", "search" and "replace", or "edits"')
    }
    entries.push({
      id: raw.id,
      packageDir,
      test: raw.test,
      testName: raw.testName,
      why: raw.why,
      edits,
    })
  })
  return { entries, problems }
}

// ── Running vitest ───────────────────────────────────────────────────────────

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Runs a command and collects its output. */
function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("error", reject)
    child.on("close", (code) => resolvePromise({ code, output }))
  })
}

/**
 * Runs `test` (and, with `testName`, only the tests whose name matches it) in
 * a package copy and reads vitest's JSON report.
 *
 * @returns {Promise<{ passed: string[], failed: string[], broken: string[], output: string }>}
 *   `broken` are the test files that failed to load (a syntax error or a throw
 *   at import), which no assertion explains.
 */
export async function runVitest(copy, { test, testName }) {
  const entry = join(copy.dir, "node_modules", "vitest", "vitest.mjs")
  if (!existsSync(entry)) {
    throw new Error(
      `vitest is not installed for ${copy.dir}; run \`pnpm install\``
    )
  }
  const report = join(copy.root, "vitest-report.json")
  const args = [
    entry,
    "run",
    test,
    "--reporter=json",
    `--outputFile=${report}`,
    ...(testName === undefined ? [] : ["-t", escapeRegExp(testName)]),
  ]
  const { output } = await run(process.execPath, args, {
    cwd: copy.dir,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
  })
  if (!existsSync(report)) {
    throw new Error(`vitest wrote no report for ${test}:\n${output.trim()}`)
  }
  const result = JSON.parse(readFileSync(report, "utf8"))
  const passed = []
  const failed = []
  const broken = []
  for (const file of result.testResults ?? []) {
    const tests = file.assertionResults ?? []
    if (file.status === "failed" && tests.length === 0) {
      broken.push(`${file.name}: ${String(file.message ?? "").split("\n")[0]}`)
    }
    for (const t of tests) {
      const name = t.fullName ?? t.title
      if (t.status === "passed") passed.push(name)
      else if (t.status === "failed") failed.push(name)
    }
  }
  return { passed, failed, broken, output }
}

const withCopy = async (repoRoot, packageDir, work) => {
  const copy = createWorkspaceCopy({ repoRoot, packageDir })
  try {
    return await work(copy)
  } finally {
    copy.cleanup()
  }
}

// ── The check ────────────────────────────────────────────────────────────────

/**
 * Runs every entry of the manifest.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string} [options.manifest] Path of the manifest; defaults to `scripts/faults.json`.
 * @param {string} [options.only] Check only this id.
 * @param {number} [options.jobs] How many entries to run at once.
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ failures: string[], verified: string[] }>}
 */
export async function verifyFaults({
  repoRoot,
  manifest = join(repoRoot, DEFAULT_MANIFEST),
  only,
  jobs = Math.min(4, availableParallelism()),
  log = () => {},
}) {
  const failures = []
  const verified = []
  const loaded = loadManifest(manifest, repoRoot)
  failures.push(...loaded.problems)
  const entries = loaded.entries.filter(
    (entry) => only === undefined || entry.id === only
  )
  if (
    only !== undefined &&
    entries.length === 0 &&
    loaded.problems.length === 0
  ) {
    failures.push(`No entry of the manifest has the id "${only}"`)
  }

  // A test is judged against an unmodified copy once, however many faults
  // name it.
  const baselines = new Map()
  const baseline = (entry) => {
    const key = [entry.packageDir, entry.test, entry.testName ?? ""].join("\0")
    if (!baselines.has(key)) {
      baselines.set(
        key,
        withCopy(repoRoot, entry.packageDir, (copy) => runVitest(copy, entry))
      )
    }
    return baselines.get(key)
  }

  const where = (entry) =>
    `${entry.packageDir}/${entry.test}${entry.testName === undefined ? "" : ` -t ${JSON.stringify(entry.testName)}`}`

  /** Judges one entry. Resolves to a failure message, or a success line. */
  const check = async (entry) => {
    const before = await baseline(entry)
    if (before.broken.length > 0 || before.failed.length > 0) {
      return {
        failure:
          `${entry.id}: ${where(entry)} does not pass without the fault, so its result under the fault means nothing:\n    ` +
          [
            ...before.broken,
            ...before.failed.map((name) => `failed: ${name}`),
          ].join("\n    "),
      }
    }
    if (before.passed.length === 0) {
      return {
        failure: `${entry.id}: ${where(entry)} matches no test. Check the path and the name.`,
      }
    }

    return withCopy(repoRoot, entry.packageDir, async (copy) => {
      try {
        applyEdits(copy.dir, entry.edits, entry.id)
      } catch (error) {
        if (error instanceof FaultError) return { failure: error.message }
        throw error
      }
      const after = await runVitest(copy, entry)
      if (after.broken.length > 0 && after.failed.length === 0) {
        return {
          failure:
            `${entry.id}: the fault broke the test file instead of the behaviour it tests (nothing ran):\n    ` +
            after.broken.join("\n    "),
        }
      }
      if (after.failed.length === 0) {
        return {
          failure:
            `${entry.id}: ${where(entry)} PASSES under its fault` +
            `${entry.why === undefined ? "" : ` (${entry.why})`}: ` +
            `${after.passed.length} test${after.passed.length === 1 ? "" : "s"} ran green with the fault applied, ` +
            `so none of them guards against it. Strengthen the test, or fix the fault if it no longer describes the regression.`,
        }
      }
      return {
        success: `  ok  ${entry.id}: ${after.failed.length} of ${before.passed.length} failed under the fault (${after.failed[0]}${after.failed.length > 1 ? ", ..." : ""})`,
      }
    })
  }

  const outcomes = new Array(entries.length)
  const queue = entries.map((entry, index) => ({ entry, index }))
  await Promise.all(
    Array.from({ length: Math.max(1, jobs) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          outcomes[next.index] = await check(next.entry)
        } catch (error) {
          outcomes[next.index] = {
            failure: `${next.entry.id}: ${error.message}`,
          }
        }
      }
    })
  )
  // Reported in the manifest's order, whatever order they finished in.
  entries.forEach((entry, index) => {
    const { failure, success } = outcomes[index]
    if (failure !== undefined) failures.push(failure)
    else {
      verified.push(entry.id)
      log(success)
    }
  })
  return { failures, verified }
}

// ── The command ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const value = (flag) => {
    const at = args.indexOf(flag)
    return at === -1 ? undefined : args[at + 1]
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
  const manifest = value("--manifest")
  const jobs = value("--jobs")
  console.log("verify-faults: each listed test must fail under its fault")
  const { failures, verified } = await verifyFaults({
    repoRoot,
    ...(manifest === undefined ? {} : { manifest: resolve(manifest) }),
    ...(jobs === undefined ? {} : { jobs: Number(jobs) }),
    only: value("--only"),
    log: console.log,
  })
  if (failures.length > 0) {
    console.error("\nFault verification failed:\n")
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }
  console.log(
    `\nEvery listed test fails under its fault (${verified.length} verified).`
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
