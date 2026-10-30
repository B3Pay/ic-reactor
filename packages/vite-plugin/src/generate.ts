/**
 * Generation: `meant gen` in a child process.
 *
 * Meant's generator is WebAssembly. Running it in the dev server's own
 * process would let one trap, one runaway loop or one memory blow-up on a bad
 * `.did` take the dev server down with it. A child process takes only itself
 * down: the plugin reads what it printed (or why it did not print) and reports
 * that for the canister it was generating.
 *
 * This module imports nothing from Vite and nothing from the CLI. It resolves
 * the CLI's bin script from the app's own `node_modules` and runs it with the
 * running Node binary, never through a shell.
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { describeError, describePath } from "./describe-value.js"

/**
 * The `@meantjs/cli` release this plugin is built against. The package
 * declares it as an exact peer, and a test keeps the two equal: the app has to
 * install the generator that pairs with the `@meantjs/schema` runtime its
 * generated modules import.
 */
export const MEANT_CLI_VERSION = "0.5.0"

/** The `schemaVersion` of the `--json` document this module understands. */
const REPORT_SCHEMA_VERSION = 1

/** How long one generator process may run before it is killed. */
export const GENERATE_TIMEOUT_MS = 60_000

/**
 * The most stderr lines of one process passed on to the logger. The generator
 * prints nothing there when all is well, so more than this is a runaway
 * process, which would flood the terminal for as long as its timeout.
 */
const MAX_STREAMED_LINES = 200

/**
 * The most characters kept of one stderr line. A longer line is logged cut at
 * this length, with a note, and the rest of it is dropped as it arrives. It
 * bounds the line being assembled, which the cap on the whole stream does not:
 * a process that writes without a newline would otherwise grow that line
 * until it exited or was killed at the timeout.
 */
const MAX_LINE_CHARS = 4096

/**
 * The most output kept from one stream of the generator. A report is a few
 * lines per canister; the cap only stops a runaway process from filling memory
 * before the timeout kills it.
 */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

/** What the generator left out of a module, as it reports it. */
export interface Omission {
  kind: string
  name: string
  reason: string
  via?: string
}

/** A canister to generate, with absolute paths. */
export interface GenerateCanister {
  /** The canister's name in the plugin options, for messages. */
  name: string
  didFile: string
  outDir: string
}

/**
 * What happened to one `.did` written into one output directory: a module, or
 * the reason there is none. It is the fate of every canister that names that
 * pair, which is why it lists names. Canisters with one interface (an ICP
 * ledger and a ckBTC ledger on `icrc1.did`) are one generation and one module.
 */
export interface Outcome {
  /** The canisters this applies to, by their names in the plugin options. */
  names: string[]
  /** The module the generator wrote or checked, when it said. */
  module?: string
  /** `written` when a file was created or changed, `unchanged` otherwise. */
  status: "written" | "unchanged" | "failed"
  omitted: Omission[]
  /** Why the generation failed, in words fit for an error message. */
  failure?: string
}

export interface GenerateResult {
  outcomes: Outcome[]
}

/**
 * The absolute path of the `meant` bin script installed for the app
 * rooted at `root`.
 *
 * Resolved from the app and not from the plugin: the CLI that pairs with the
 * app's `@meantjs/schema` is the one the app installed, wherever the
 * package manager put the plugin. Throws an `Error` that says what to install.
 */
export function resolveCliBin(root: string): string {
  const requireFromApp = createRequire(path.join(root, "package.json"))
  let manifestPath: string
  try {
    manifestPath = requireFromApp.resolve("@meantjs/cli/package.json")
  } catch {
    throw new Error(
      `cannot find @meantjs/cli from ${root}. Install the generator that pairs with ` +
        `this plugin next to @meantjs/schema: npm install --save-dev --save-exact ` +
        `@meantjs/cli@${MEANT_CLI_VERSION}`
    )
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
    bin?: string | Record<string, string>
  }
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.meant
  if (!bin) {
    throw new Error(
      `${manifestPath} declares no \`meant\` bin, so it is not the generator this plugin runs`
    )
  }
  return path.resolve(path.dirname(manifestPath), bin)
}

export interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
  signal: NodeJS.Signals | null
  /** Set when the process never ran to its end: it did not start, or was killed at the timeout or by the caller. */
  problem?: string
  /** Whether Node could not start the process at all, so another try would fail the same way. */
  unstartable?: boolean
  /** Whether the caller stopped the process, so nothing is left to try. */
  stopped?: boolean
}

const keep = (text: string, chunk: string, limit: number) =>
  text.length >= limit ? text : text + chunk

/**
 * Run `node <bin> ...args` in `cwd` and settle with what it did. Never
 * rejects. Aborting `signal` kills the process, and a signal that is already
 * aborted starts none.
 *
 * @param maxOutputBytes - The most kept of each stream. A report larger than
 * this is cut, so it no longer parses.
 */
export function runProcess(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
  onStderrLine?: (line: string) => void,
  maxOutputBytes = MAX_OUTPUT_BYTES
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let settled = false

    const stopped: Omit<ProcessResult, "stdout" | "stderr"> = {
      code: null,
      signal: null,
      problem: "was stopped",
      stopped: true,
    }
    if (signal?.aborted) {
      resolve({ stdout, stderr, ...stopped })
      return
    }

    // A line is passed on when it is complete, not when its first bytes
    // arrive, and what follows the last newline is passed on at the end. The
    // line being assembled keeps at most MAX_LINE_CHARS characters: `cut` says
    // that it had more.
    let unfinished = ""
    let cut = false
    let passed = 0
    const pass = (text: string) => {
      if (!text.trim() || passed > MAX_STREAMED_LINES) return
      passed++
      onStderrLine?.(
        passed > MAX_STREAMED_LINES
          ? `more than ${MAX_STREAMED_LINES} lines on stderr: the rest is not logged`
          : text.trimEnd()
      )
    }
    const passUnfinished = () => {
      pass(
        cut
          ? `${unfinished} [line cut at ${MAX_LINE_CHARS} characters]`
          : unfinished
      )
      unfinished = ""
      cut = false
    }

    const settle = (result: Omit<ProcessResult, "stdout" | "stderr">) => {
      if (settled) return
      settled = true
      passUnfinished()
      clearTimeout(timer)
      signal?.removeEventListener("abort", stop)
      resolve({ stdout, stderr, ...result })
    }
    const stop = () => {
      // Nothing of a run that was stopped is passed on, not even a last line.
      unfinished = ""
      cut = false
      child.kill("SIGKILL")
      settle(stopped)
    }

    // No shell, and stdin closed: the CLI never reads it, and a child that
    // inherited the dev server's terminal could not be told apart from it.
    const child = spawn(process.execPath, [bin, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    signal?.addEventListener("abort", stop, { once: true })

    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on(
      "data",
      (chunk: string) => (stdout = keep(stdout, chunk, maxOutputBytes))
    )
    child.stderr.on("data", (chunk: string) => {
      stderr = keep(stderr, chunk, maxOutputBytes)
      // Past the last line that is logged there is nothing left to assemble.
      if (settled || !onStderrLine || passed > MAX_STREAMED_LINES) return
      const pieces = chunk.split(/\r?\n/)
      pieces.forEach((piece, index) => {
        const room = MAX_LINE_CHARS - unfinished.length
        if (piece.length > room) cut = true
        unfinished += piece.slice(0, room)
        if (index < pieces.length - 1) passUnfinished()
      })
    })
    child.on("error", (error) =>
      settle({
        code: null,
        signal: null,
        problem: `could not start: ${error.message}`,
        unstartable: true,
      })
    )
    child.on("close", (code, signal) =>
      settle({
        code,
        signal,
        problem: timedOut
          ? `did not finish within ${timeoutMs / 1000}s and was killed`
          : undefined,
      })
    )
  })
}

/** How a process that produced no usable report ended, with its stderr. */
export function describeProcess(run: ProcessResult, reason?: string): string {
  const ending =
    run.problem ??
    (run.signal
      ? `was killed by ${run.signal}`
      : `exited with code ${run.code}`)
  const lines = [`\`meant\` ${ending}`]
  if (reason) lines.push(reason)
  const stderr = run.stderr.trim()
  if (stderr) lines.push(stderr)
  return lines.join("\n")
}

interface ReportEntry {
  status: string
  module?: string
  omitted: Omission[]
  diagnostics: unknown[]
}

/**
 * The entries of a `--json` document, in command-line order: `undefined` when
 * stdout is not JSON at all, and an `Error` for a document this module does
 * not know how to read.
 */
function parseReport(stdout: string, count: number): ReportEntry[] | undefined {
  let report: unknown
  try {
    report = JSON.parse(stdout)
  } catch {
    return undefined
  }
  const { schemaVersion, entries } = (report ?? {}) as Record<string, unknown>
  if (schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new Error(
      `its report has schemaVersion ${String(schemaVersion)}, and this plugin reads ${REPORT_SCHEMA_VERSION}; ` +
        `install @meantjs/cli@${MEANT_CLI_VERSION}`
    )
  }
  if (!Array.isArray(entries) || entries.length !== count) {
    throw new Error(`its report does not have one entry per .did (${count})`)
  }
  return entries.map((entry): ReportEntry => {
    const { status, module, omitted, diagnostics } = entry as Record<
      string,
      unknown
    >
    return {
      status: String(status),
      module: typeof module === "string" ? module : undefined,
      omitted: Array.isArray(omitted) ? (omitted as Omission[]) : [],
      diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
    }
  })
}

/** One line (plus its notes) for a compiler diagnostic. */
export function formatDiagnostic(diagnostic: unknown): string {
  const { code, message, notes } = (diagnostic ?? {}) as {
    code?: unknown
    message?: unknown
    notes?: unknown
  }
  if (typeof message !== "string") return JSON.stringify(diagnostic)
  const lead = typeof code === "string" ? `${code}: ${message}` : message
  const extra = Array.isArray(notes) ? notes.map((note) => `  ${note}`) : []
  return [lead, ...extra].join("\n")
}

/** What every generator process of one `generate` call shares. */
interface Context {
  cli: string
  root: string
  timeoutMs: number
  signal?: AbortSignal
  /**
   * Called with each line a generator process writes to stderr, as it writes
   * it, and the `.did` files that process is generating. The generator prints
   * nothing there with `--json` when all is well, so a line is worth showing.
   * What a process that failed wrote is also part of its failure message.
   */
  onStderr?: (line: string, didFiles: string[]) => void
}

/** One `.did` to write into one output directory, for each canister that names the pair. */
interface Unit {
  names: string[]
  didFile: string
  outDir: string
}

/**
 * One generator process for `units`, which all write into `outDir`. The report
 * names each unit's fate. A process that ends without a usable report (it
 * crashed, or was killed at the timeout) fails every unit it was given, unless
 * there is more than one: it could have been any of them, so each is run alone
 * to find out, side by side. A unit that is the cause fails alone, and the
 * others are generated. A hang costs one more wait for that unit, and no more.
 */
async function runGroup(
  context: Context,
  outDir: string,
  units: Unit[]
): Promise<GenerateResult> {
  const run = await runProcess(
    context.cli,
    ["gen", ...units.map((unit) => unit.didFile), "-o", outDir, "--json"],
    context.root,
    context.timeoutMs,
    context.signal,
    (line) =>
      context.onStderr?.(
        line,
        units.map((unit) => unit.didFile)
      )
  )

  let entries: ReportEntry[] | undefined
  let reason: string | undefined
  if (!run.problem) {
    try {
      entries = parseReport(run.stdout, units.length)
      // A process that crashed says so by its exit and its stderr.
      if (!entries && run.code === 0) reason = "it printed no report"
    } catch (error) {
      reason = describeError(error)
    }
  }

  if (!entries) {
    if (units.length > 1 && !run.unstartable && !run.stopped) {
      const results = await Promise.all(
        units.map((unit) => runGroup(context, outDir, [unit]))
      )
      return { outcomes: results.flatMap((result) => result.outcomes) }
    }
    const failure = describeProcess(run, reason)
    return {
      outcomes: units.map(({ names }) => ({
        names,
        status: "failed",
        omitted: [],
        failure,
      })),
    }
  }

  return {
    outcomes: units.map((unit, index): Outcome => {
      const entry = entries[index]
      if (entry.status === "failed") {
        return {
          names: unit.names,
          status: "failed",
          omitted: [],
          failure:
            entry.diagnostics.map(formatDiagnostic).join("\n") ||
            "`meant` reported the entry as failed",
        }
      }
      return {
        names: unit.names,
        module: entry.module,
        status: entry.status === "unchanged" ? "unchanged" : "written",
        omitted: entry.omitted,
      }
    }),
  }
}

/** `"a"`, or `"a", "b"`: canister names as messages quote them. */
export function quoteNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ")
}

/**
 * Whether the filesystem that holds `dir` takes `A.ts` and `a.ts` for one
 * file, `undefined` when that cannot be told.
 *
 * It looks a name up in a spelling with its case swapped and asks whether that
 * finds the same entry. The name is one inside `dir`, or inside the nearest
 * directory above it that exists (`dir` may be made by the generator), or that
 * directory's own, so that the lookup is made where the modules will be. Only
 * ASCII letters are swapped: other scripts fold by rules a probe cannot know.
 */
export function foldsCase(dir: string): boolean | undefined {
  const swapCase = (name: string) =>
    name.replace(/[a-z]/gi, (letter) =>
      letter === letter.toLowerCase()
        ? letter.toUpperCase()
        : letter.toLowerCase()
    )
  const probe = (entry: string): boolean | undefined => {
    const swapped = path.join(
      path.dirname(entry),
      swapCase(path.basename(entry))
    )
    if (swapped === entry) return undefined
    try {
      const found = fs.lstatSync(entry, { bigint: true })
      // A filesystem that reports no file index cannot say that two names
      // are one file.
      if (found.ino === 0n) return undefined
      try {
        const other = fs.lstatSync(swapped, { bigint: true })
        return other.dev === found.dev && other.ino === found.ino
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT"
          ? false
          : undefined
      }
    } catch {
      return undefined
    }
  }

  for (let at = dir; ; at = path.dirname(at)) {
    let names: string[] = []
    try {
      names = fs.readdirSync(at)
    } catch {
      // Not made yet, or not a directory.
    }
    const named = names.find((name) => swapCase(name) !== name)
    const verdict =
      (named === undefined ? undefined : probe(path.join(at, named))) ??
      probe(at)
    if (verdict !== undefined) return verdict
    if (path.dirname(at) === at) return undefined
  }
}

/**
 * Each pair of `.did` and `outDir` of `canisters` once, as one generation,
 * and the generations refused, each with the one before it that writes its
 * module (`owner`). The CLI names a module after its `.did` (`outputsOf`), so
 * `a/ledger.did` and `b/ledger.did` in one `outDir` write one `ledger.ts`:
 * the first in the order of `canisters` keeps it. Whether `A.did` and `a.did`
 * collide depends on the filesystem of the `outDir`, which `folds` is asked
 * once for each: they do where it ignores case (macOS and Windows by default)
 * and write two modules where it does not, or where it cannot be told.
 */
function planGenerations(
  canisters: GenerateCanister[],
  folds: (outDir: string) => boolean | undefined
): { units: Unit[]; refused: Map<Unit, Unit> } {
  // Each pair of .did and outDir once, and the module each would write.
  const units = new Map<string, Unit>()
  const claimed = new Map<string, Unit>()
  const refused = new Map<Unit, Unit>()

  // The probe runs once for each outDir.
  const folding = new Map<string, boolean>()
  const targetOf = (unit: Unit): string => {
    let folded = folding.get(unit.outDir)
    if (folded === undefined) {
      folded = folds(unit.outDir) ?? false
      folding.set(unit.outDir, folded)
    }
    return folded ? moduleOf(unit).toLowerCase() : moduleOf(unit)
  }

  for (const canister of canisters) {
    const key = JSON.stringify([canister.didFile, canister.outDir])
    const same = units.get(key)
    if (same) {
      same.names.push(canister.name)
      continue
    }
    const unit: Unit = {
      names: [canister.name],
      didFile: canister.didFile,
      outDir: canister.outDir,
    }
    units.set(key, unit)
    const target = targetOf(unit)
    const owner = claimed.get(target)
    if (owner) refused.set(unit, owner)
    else claimed.set(target, unit)
  }
  return { units: [...units.values()], refused }
}

/** Why `unit` is not generated: it would write the module `owner` writes. */
function collisionFailure(unit: Unit, owner: Unit, root: string): string {
  return (
    `would write ${describePath(path.relative(root, moduleOf(unit)))}, which ${quoteNames(owner.names)} already writes` +
    (moduleOf(unit) === moduleOf(owner)
      ? ". "
      : ` as ${describePath(path.relative(root, moduleOf(owner)))}: the filesystem does not tell the two names apart. `) +
    `The generator names a module after its .did file: rename one file or give one canister its own outDir`
  )
}

/**
 * The canisters of `canisters` that cannot be generated because one before
 * them writes their module, by name, each with why: the canisters `generate`
 * would refuse if it were given them all. The plugin asks it of every
 * canister it generates before a run does anything, so that such a canister
 * is refused before anything is fetched, run or written for it, whichever
 * canisters the run then generates. Never throws.
 *
 * @param folds - Whether the filesystem of an `outDir` ignores case: by
 * default, the `foldsCase` probe.
 */
export function moduleCollisions(
  canisters: GenerateCanister[],
  root: string,
  folds: (outDir: string) => boolean | undefined = foldsCase
): Map<string, string> {
  const failures = new Map<string, string>()
  for (const [unit, owner] of planGenerations(canisters, folds).refused) {
    const failure = collisionFailure(unit, owner, root)
    for (const name of unit.names) failures.set(name, failure)
  }
  return failures
}

/**
 * Generate `canisters` with the CLI at `cli`: one process for each output
 * directory, run side by side. Never rejects. Aborting `signal` kills the
 * processes that are running, and their canisters fail as stopped.
 *
 * Canisters that name the same `.did` and the same `outDir` are one
 * generation: the CLI gets the file once, and its outcome belongs to each of
 * them. That is the case of many canisters with one interface (two ICRC-1
 * ledgers on `icrc1.did`), which share one module.
 *
 * Different `.did` files that would write the same module (the CLI names an
 * output after its `.did`, so `a/ledger.did` and `b/ledger.did` in one
 * `outDir` collide) are refused here, naming both. The CLI would otherwise
 * refuse the whole run with a usage error. Whether `A.did` and `a.did` collide
 * depends on the filesystem of the `outDir`: they do where it ignores case
 * (macOS and Windows by default) and write two modules where it does not. The
 * plugin refuses such a canister before its run does anything for it (see
 * `moduleCollisions`), so for the plugin this is the check of last resort.
 */
export async function generate(
  request: Context & {
    canisters: GenerateCanister[]
    /**
     * Whether the filesystem that holds an `outDir` ignores case, `undefined`
     * when unknown, which is taken as a filesystem that does not. For tests,
     * which cannot rely on the filesystem of the machine they run on.
     */
    foldsCase?: (outDir: string) => boolean | undefined
  }
): Promise<GenerateResult> {
  const { root } = request
  const { units, refused } = planGenerations(
    request.canisters,
    request.foldsCase ?? foldsCase
  )

  const outcomes: Outcome[] = [...refused].map(([unit, owner]) => ({
    names: unit.names,
    status: "failed",
    omitted: [],
    failure: collisionFailure(unit, owner, root),
  }))

  const groups = new Map<string, Unit[]>()
  for (const unit of units) {
    if (refused.has(unit)) continue
    groups.set(unit.outDir, [...(groups.get(unit.outDir) ?? []), unit])
  }
  const results = await Promise.all(
    [...groups].map(([outDir, members]) => runGroup(request, outDir, members))
  )
  return {
    outcomes: [...outcomes, ...results.flatMap((result) => result.outcomes)],
  }
}

/** The files `meant gen` writes for one `.did`, as it names them. */
export interface Outputs {
  /** The `.did`'s file name without a final `.did`: `ledger` for `a/ledger.did`. */
  stem: string
  /** `<stem>.ts` in the output directory: the generated module. */
  module: string
  /** `<stem>.envelope.json` beside it: the contract envelope. */
  envelope: string
}

/**
 * The files `meant gen` writes for the `.did` at `didFile` into
 * `outDir`, named as the CLI names them: after the file's name with a final
 * `.did` cut off, exactly, and nothing else cut. `a/ledger.did` writes
 * `ledger.ts` and `ledger.envelope.json`, `ledger.v2.did` writes
 * `ledger.v2.ts`, and a file named `.did` writes `.ts`. A name that does not
 * end in `.did` (`api.candid`, `api.DID`) keeps its whole name
 * (`api.candid.ts`), and the CLI reads no such file: it fails its entry
 * (`did_source_not_found`) and writes nothing.
 *
 * The plugin's one rule for these names: the modules canisters would write
 * (`moduleCollisions`, `generate`) and the files a run puts back when it takes
 * nothing of a `.did` written while the generator read it are both named by
 * it. The rule is the CLI's own (its `stemOf`), and a test compares it with
 * the paths the CLI reports.
 */
export function outputsOf({
  didFile,
  outDir,
}: {
  didFile: string
  outDir: string
}): Outputs {
  const stem = path.basename(didFile).replace(/\.did$/, "")
  return {
    stem,
    module: path.join(outDir, `${stem}.ts`),
    envelope: path.join(outDir, `${stem}.envelope.json`),
  }
}

/** The module the CLI writes for `unit` (see `outputsOf`). */
function moduleOf(unit: Unit): string {
  return outputsOf(unit).module
}
