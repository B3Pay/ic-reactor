/**
 * Generation: `candid-core-cli gen` in a child process.
 *
 * candid-core's generator is WebAssembly. Running it in the dev server's own
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

/**
 * The `@candid-core/cli` release this plugin is built against. The package
 * declares it as an exact peer, and a test keeps the two equal: the app has to
 * install the generator that pairs with the `@candid-core/schema` runtime its
 * generated modules import.
 */
export const CANDID_CORE_CLI_VERSION = "0.2.0-beta.1"

/** The `schemaVersion` of the `--json` document this module understands. */
const REPORT_SCHEMA_VERSION = 1

/** How long one generator process may run before it is killed. */
export const GENERATE_TIMEOUT_MS = 60_000

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
 * The absolute path of the `candid-core-cli` bin script installed for the app
 * rooted at `root`.
 *
 * Resolved from the app and not from the plugin: the CLI that pairs with the
 * app's `@candid-core/schema` is the one the app installed, wherever the
 * package manager put the plugin. Throws an `Error` that says what to install.
 */
export function resolveCliBin(root: string): string {
  const requireFromApp = createRequire(path.join(root, "package.json"))
  let manifestPath: string
  try {
    manifestPath = requireFromApp.resolve("@candid-core/cli/package.json")
  } catch {
    throw new Error(
      `cannot find @candid-core/cli from ${root}. Install the generator that pairs with ` +
        `this plugin next to @candid-core/schema: npm install --save-dev --save-exact ` +
        `@candid-core/cli@${CANDID_CORE_CLI_VERSION}`
    )
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
    bin?: string | Record<string, string>
  }
  const bin =
    typeof manifest.bin === "string"
      ? manifest.bin
      : manifest.bin?.["candid-core-cli"]
  if (!bin) {
    throw new Error(
      `${manifestPath} declares no candid-core-cli bin, so it is not the generator this plugin runs`
    )
  }
  return path.resolve(path.dirname(manifestPath), bin)
}

interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
  signal: NodeJS.Signals | null
  /** Set when the process never ran to its end: it did not start, or was killed at the timeout. */
  problem?: string
  /** Whether Node could not start the process at all, so another try would fail the same way. */
  unstartable?: boolean
  /** Whether the caller stopped the process, so nothing is left to try. */
  stopped?: boolean
}

const keep = (text: string, chunk: string) =>
  text.length >= MAX_OUTPUT_BYTES ? text : text + chunk

/**
 * Run `node <bin> ...args` in `cwd` and settle with what it did. Never
 * rejects. Aborting `signal` kills the process, and a signal that is already
 * aborted starts none.
 */
function runProcess(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
  onStderrLine?: (line: string) => void
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
    // arrive, and what follows the last newline is passed on at the end.
    let unfinished = ""
    const pass = (text: string) => {
      if (text.trim()) onStderrLine?.(text.trimEnd())
    }

    const settle = (result: Omit<ProcessResult, "stdout" | "stderr">) => {
      if (settled) return
      settled = true
      pass(unfinished)
      clearTimeout(timer)
      signal?.removeEventListener("abort", stop)
      resolve({ stdout, stderr, ...result })
    }
    const stop = () => {
      // Nothing of a run that was stopped is passed on, not even a last line.
      unfinished = ""
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
    child.stdout.on("data", (chunk: string) => (stdout = keep(stdout, chunk)))
    child.stderr.on("data", (chunk: string) => {
      stderr = keep(stderr, chunk)
      if (settled || !onStderrLine) return
      const lines = (unfinished + chunk).split(/\r?\n/)
      unfinished = lines.pop() ?? ""
      lines.forEach(pass)
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
function describeProcess(run: ProcessResult, reason?: string): string {
  const ending =
    run.problem ??
    (run.signal
      ? `was killed by ${run.signal}`
      : `exited with code ${run.code}`)
  const lines = [`candid-core-cli ${ending}`]
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
        `install @candid-core/cli@${CANDID_CORE_CLI_VERSION}`
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
function formatDiagnostic(diagnostic: unknown): string {
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
      reason = error instanceof Error ? error.message : String(error)
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
            "candid-core-cli reported the entry as failed",
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
function quoteNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ")
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
 * refuse the whole run with a usage error.
 */
export async function generate(
  request: Context & { canisters: GenerateCanister[] }
): Promise<GenerateResult> {
  const { root } = request
  // Each pair of .did and outDir once, and the module each would write.
  const units = new Map<string, Unit>()
  const claimed = new Map<string, Unit>()
  const refused = new Map<Unit, Unit>()

  for (const canister of request.canisters) {
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
    const target = moduleOf(unit).toLowerCase()
    const owner = claimed.get(target)
    if (owner) refused.set(unit, owner)
    else claimed.set(target, unit)
  }

  const outcomes: Outcome[] = [...refused].map(([unit, owner]) => ({
    names: unit.names,
    status: "failed",
    omitted: [],
    failure:
      `would write ${path.relative(root, moduleOf(unit))}, which ${quoteNames(owner.names)} already writes. ` +
      `The generator names a module after its .did file: rename one file or give one canister its own outDir`,
  }))

  const groups = new Map<string, Unit[]>()
  for (const unit of units.values()) {
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

/** The module the CLI writes for `unit`: it names it after the `.did`. */
function moduleOf(unit: Unit): string {
  return path.join(
    unit.outDir,
    path.basename(unit.didFile, path.extname(unit.didFile)) + ".ts"
  )
}
