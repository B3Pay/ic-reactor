#!/usr/bin/env node
/**
 * Proves that every trap type of a `traps.test-d.ts` bites.
 *
 * A trap is a `@ts-expect-error` line that documents a mistake the types make
 * a compile error. It stays green when the type stops trapping only if nobody
 * runs `tsc` over the file, and "nobody" is the usual case: a refactor widens
 * a type, the directive turns into TS2578 ("Unused '@ts-expect-error'
 * directive") in a file no reviewer opens, and the guarantee is gone. This
 * script removes each trap on purpose and checks that the compiler notices.
 *
 * Each trap is tagged in the traps file, on the line above its directive:
 *
 *     // trap: <id>
 *     // @ts-expect-error <why>
 *     theLine()
 *
 * and `scripts/traps/<id>.json` (or `.mjs`) is the fault that removes it. For
 * every id this script
 *
 * 1. copies the package to a temporary directory (the working tree is never
 *    written to),
 * 2. applies the fault to the copy,
 * 3. runs `tsc` on the package's typecheck project, narrowed to its sources
 *    and the traps file,
 * 4. requires TS2578 on exactly the lines tagged with the id, and no other
 *    diagnostic: a fault that breaks something besides its trap proves
 *    nothing about the trap.
 *
 * It first compiles an unfaulted copy and requires a clean result, so a trap
 * file that does not compile in the first place fails here and not as a
 * confusing flood of "expected" errors.
 *
 * It also fails on a `@ts-expect-error` with no tag, a tag with no directive
 * under it, a `@ts-ignore` or `@ts-nocheck` in the file, a trap with no
 * fixture and a fixture with no trap, so a trap cannot be added without its
 * proof.
 *
 * Usage
 *   node scripts/verify-traps.mjs [--only <id>] [--jobs <n>]
 *
 * Adding a trap is documented in the header of
 * `packages/core/tests/traps.test-d.ts`.
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { availableParallelism } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  FaultError,
  applyEdits,
  createWorkspaceCopy,
} from "./lib/fault-workspace.mjs"

const TSC = createRequire(import.meta.url).resolve("typescript/lib/tsc.js")

/**
 * The trap files: a package, the traps file in it, and the tsconfig of the
 * package that includes both `src` and `tests`.
 */
export const SUITES = [
  {
    package: "packages/core",
    file: "tests/traps.test-d.ts",
    tsconfig: "tsconfig.typecheck.json",
  },
]

/** `Unused '@ts-expect-error' directive.` */
const UNUSED_DIRECTIVE = 2578

const TAG = /^\s*\/\/\s*trap:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/

/**
 * A comment line that TypeScript reads as a directive: the directive is the
 * first thing in the comment, after `//`, `///`, `/*` or a block comment's
 * leading `*`. A mention in the middle of a sentence, or in a comment line
 * that starts with something else, is prose.
 */
const DIRECTIVE_START = String.raw`^\s*(?:\/\/\/?|\/\*+|\*+)\s*@ts-`
const EXPECT_ERROR = new RegExp(`${DIRECTIVE_START}expect-error\\b`)
const OTHER_DIRECTIVE = new RegExp(`${DIRECTIVE_START}(?:ignore|nocheck)\\b`)

// ── Reading the traps file ───────────────────────────────────────────────────

/**
 * The traps of a file: each tag and the line of the directive under it.
 *
 * @param {string} text
 * @returns {{ traps: { id: string, line: number }[], problems: string[] }}
 *   `line` is the 1-based line of the `@ts-expect-error` comment, where the
 *   compiler reports it once it is unused.
 */
export function parseTraps(text) {
  const lines = text.split("\n")
  const traps = []
  const problems = []
  const tagged = new Set()
  lines.forEach((line, index) => {
    const number = index + 1
    const tag = TAG.exec(line)
    if (tag) {
      if (EXPECT_ERROR.test(lines[index + 1] ?? "")) {
        traps.push({ id: tag[1], line: number + 1 })
        tagged.add(index + 1)
      } else {
        problems.push(
          `line ${number}: the tag "trap: ${tag[1]}" must be followed on the next line by its // @ts-expect-error`
        )
      }
    }
  })
  lines.forEach((line, index) => {
    const number = index + 1
    if (OTHER_DIRECTIVE.test(line)) {
      problems.push(
        `line ${number}: @ts-ignore and @ts-nocheck hide errors without being proven; a trap file uses tagged @ts-expect-error only`
      )
    } else if (EXPECT_ERROR.test(line) && !tagged.has(index)) {
      problems.push(
        `line ${number}: this @ts-expect-error has no "// trap: <id>" tag on the line above it, so nothing proves it still traps`
      )
    }
  })
  return { traps, problems }
}

// ── Running tsc ──────────────────────────────────────────────────────────────

/** Runs a command and collects its output. */
function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/

/**
 * Compiles the package copy's typecheck project, narrowed to its `src` and
 * the traps file, and returns the diagnostics.
 *
 * @returns {Promise<{ file: string, line: number, column: number, code: number, message: string }[]>}
 */
export async function typecheck(dir, { tsconfig, file }) {
  const project = "tsconfig.traps.json"
  writeFileSync(
    join(dir, project),
    JSON.stringify({
      extends: `./${tsconfig}`,
      include: ["src/**/*", file],
    })
  )
  const { stdout, stderr } = await run(
    process.execPath,
    [TSC, "--noEmit", "--pretty", "false", "-p", project],
    { cwd: dir }
  )
  const found = []
  for (const line of stdout.split("\n")) {
    const match = DIAGNOSTIC.exec(line)
    if (match) {
      found.push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        code: Number(match[4]),
        message: match[5],
      })
    } else if (/^error TS\d+:/.test(line)) {
      // A diagnostic without a position: bad options, an unreadable config.
      found.push({ file: "", line: 0, column: 0, code: 0, message: line })
    }
  }
  if (found.length === 0 && stderr.trim() !== "") {
    found.push({
      file: "",
      line: 0,
      column: 0,
      code: 0,
      message: stderr.trim(),
    })
  }
  return found
}

const show = (diagnostic) =>
  diagnostic.file === ""
    ? diagnostic.message
    : `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`

// ── The faults ───────────────────────────────────────────────────────────────

/** The fixture files of `dir`, by trap id. */
function fixturesOf(dir) {
  const byId = new Map()
  if (!existsSync(dir)) return byId
  for (const name of readdirSync(dir).sort()) {
    const match = /^(.+)\.(json|mjs)$/.exec(name)
    if (!match) continue
    byId.set(match[1], [...(byId.get(match[1]) ?? []), join(dir, name)])
  }
  return byId
}

/** Applies the fixture to the package copy at `dir`. */
async function applyFixture(path, dir, id) {
  if (path.endsWith(".mjs")) {
    const { default: fault } = await import(pathToFileURL(path).href)
    if (typeof fault !== "function") {
      throw new FaultError(`${id}: ${path} must export a default function`)
    }
    await fault({ dir, applyEdits: (edits) => applyEdits(dir, edits, id) })
    return
  }
  let data
  try {
    data = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new FaultError(`${id}: ${path} is not valid JSON: ${error.message}`)
  }
  applyEdits(dir, data.edits ?? [data], id)
}

// ── The check ────────────────────────────────────────────────────────────────

/**
 * Verifies every trap of every suite.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {typeof SUITES} [options.suites]
 * @param {string} [options.fixturesDir] Defaults to `scripts/traps` of `repoRoot`.
 * @param {string} [options.only] Check only this id.
 * @param {number} [options.jobs] How many faults to compile at once.
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ failures: string[], verified: string[] }>}
 */
export async function verifyTraps({
  repoRoot,
  suites = SUITES,
  fixturesDir = join(repoRoot, "scripts", "traps"),
  only,
  jobs = Math.min(4, availableParallelism()),
  log = () => {},
}) {
  const failures = []
  const verified = []
  const fixtures = fixturesOf(fixturesDir)
  const known = new Set()
  const work = []

  for (const suite of suites) {
    const path = join(repoRoot, suite.package, suite.file)
    if (!existsSync(path)) {
      failures.push(`${suite.package}/${suite.file} does not exist`)
      continue
    }
    const { traps, problems } = parseTraps(readFileSync(path, "utf8"))
    for (const problem of problems) {
      failures.push(`${suite.package}/${suite.file}: ${problem}`)
    }
    if (traps.length === 0 && problems.length === 0) {
      failures.push(`${suite.package}/${suite.file} holds no trap`)
    }
    const byId = new Map()
    for (const trap of traps) {
      byId.set(trap.id, [...(byId.get(trap.id) ?? []), trap.line])
    }
    for (const [id, lines] of byId) {
      if (known.has(id)) {
        failures.push(`The trap id "${id}" is used by more than one suite`)
        continue
      }
      known.add(id)
      const files = fixtures.get(id) ?? []
      if (files.length === 0) {
        failures.push(
          `${id}: no fault fixture. Write scripts/traps/${id}.json: the change that makes ${suite.file}:${lines.join(", ")} compile.`
        )
      } else if (files.length > 1) {
        failures.push(`${id}: more than one fixture (${files.join(", ")})`)
      } else if (only === undefined || only === id) {
        work.push({ suite, id, lines, fixture: files[0] })
      }
    }
  }
  for (const id of fixtures.keys()) {
    if (!known.has(id)) {
      failures.push(
        `scripts/traps/${id}.*: a fault fixture for a trap no traps file tags. Delete it, or tag the trap "// trap: ${id}".`
      )
    }
  }
  if (only !== undefined && work.length === 0) {
    failures.push(`No trap is tagged "${only}"`)
  }
  if (work.length === 0) return { failures, verified }

  // The unfaulted copy must be clean before any fault means something.
  for (const suite of new Set(work.map((item) => item.suite))) {
    const copy = createWorkspaceCopy({ repoRoot, packageDir: suite.package })
    try {
      const diagnostics = await typecheck(copy.dir, suite)
      if (diagnostics.length > 0) {
        failures.push(
          `${suite.package}/${suite.file} does not compile as it stands, so no fault can be judged against it:\n    ` +
            diagnostics.map(show).join("\n    ")
        )
        return { failures, verified }
      }
    } finally {
      copy.cleanup()
    }
  }

  /** Judges one trap. Resolves to a failure message, or undefined when it bites. */
  const check = async ({ suite, id, lines, fixture }) => {
    const copy = createWorkspaceCopy({ repoRoot, packageDir: suite.package })
    try {
      try {
        await applyFixture(fixture, copy.dir, id)
      } catch (error) {
        if (error instanceof FaultError) return error.message
        throw error
      }
      const diagnostics = await typecheck(copy.dir, suite)
      const unused = diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === UNUSED_DIRECTIVE && diagnostic.file === suite.file
      )
      const unusedLines = unused.map((diagnostic) => diagnostic.line)
      const others = diagnostics.filter(
        (diagnostic) => !unused.includes(diagnostic)
      )
      const missed = lines.filter((line) => !unusedLines.includes(line))
      const extra = unusedLines.filter((line) => !lines.includes(line))
      const problems = []
      if (missed.length > 0) {
        problems.push(
          `the fault does not remove the trap: ${suite.file}:${missed.join(", ")} still errors, so its @ts-expect-error is not reported as unused (TS2578)`
        )
      }
      if (extra.length > 0) {
        problems.push(
          `the fault also removes the trap at ${suite.file}:${extra.join(", ")}, which is tagged with another id; one fault must remove one trap`
        )
      }
      if (others.length > 0) {
        problems.push(
          `the fault breaks more than its trap, so it proves nothing about it:\n      ` +
            others.map(show).join("\n      ")
        )
      }
      return problems.length > 0
        ? `${id}: ${problems.join("\n    ")}`
        : undefined
    } finally {
      copy.cleanup()
    }
  }

  const outcomes = new Array(work.length)
  const queue = work.map((item, index) => ({ item, index }))
  await Promise.all(
    Array.from({ length: Math.max(1, jobs) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        outcomes[next.index] = await check(next.item)
      }
    })
  )
  // Reported in the order of the traps file, whatever order they finished in.
  work.forEach(({ suite, id, lines }, index) => {
    if (outcomes[index] === undefined) {
      verified.push(id)
      log(
        `  ok  ${id} (${suite.file}:${lines.join(", ")} unused under its fault)`
      )
    } else {
      failures.push(outcomes[index])
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
  const jobs =
    value("--jobs") === undefined ? undefined : Number(value("--jobs"))
  console.log("verify-traps: removing each trap from a copy and compiling it")
  const { failures, verified } = await verifyTraps({
    repoRoot,
    only: value("--only"),
    ...(jobs === undefined ? {} : { jobs }),
    log: console.log,
  })
  if (failures.length > 0) {
    console.error("\nTrap verification failed:\n")
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }
  console.log(`\nEvery trap bites (${verified.length} verified).`)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
