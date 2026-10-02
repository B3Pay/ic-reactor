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

/** What happened to one canister. */
export interface CanisterOutcome {
  name: string
  /** The module the generator wrote or checked, when it said. */
  module?: string
  /** `written` when a file was created or changed, `unchanged` otherwise. */
  status: "written" | "unchanged" | "failed"
  omitted: Omission[]
  /** Why the canister failed, in words fit for an error message. */
  failure?: string
}

export interface GenerateResult {
  canisters: CanisterOutcome[]
  /**
   * What the processes that produced a report wrote to stderr. The generator
   * prints nothing there with `--json`, so any text is worth showing. The
   * stderr of a process that produced none is part of its canisters' `failure`.
   */
  stderr: string
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
}

const keep = (text: string, chunk: string) =>
  text.length >= MAX_OUTPUT_BYTES ? text : text + chunk

/** Run `node <bin> ...args` in `cwd` and settle with what it did. Never rejects. */
function runProcess(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let settled = false

    const settle = (result: Omit<ProcessResult, "stdout" | "stderr">) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, ...result })
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

    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on("data", (chunk: string) => (stdout = keep(stdout, chunk)))
    child.stderr.on("data", (chunk: string) => (stderr = keep(stderr, chunk)))
    child.on("error", (error) =>
      settle({
        code: null,
        signal: null,
        problem: `could not start: ${error.message}`,
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

/**
 * One generator process for `canisters`, which all write into `outDir`. The
 * report names each canister's fate. A process that ends without a usable
 * report fails every canister it was given, unless there is more than one: it
 * could have been any of them, so each is run alone to find out.
 */
async function runGroup(
  cli: string,
  root: string,
  outDir: string,
  canisters: GenerateCanister[],
  timeoutMs: number
): Promise<GenerateResult> {
  const run = await runProcess(
    cli,
    [
      "gen",
      ...canisters.map((canister) => canister.didFile),
      "-o",
      outDir,
      "--json",
    ],
    root,
    timeoutMs
  )

  let entries: ReportEntry[] | undefined
  let reason: string | undefined
  if (!run.problem) {
    try {
      entries = parseReport(run.stdout, canisters.length)
      // A process that crashed says so by its exit and its stderr.
      if (!entries && run.code === 0) reason = "it printed no report"
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
    }
  }

  if (!entries) {
    // A timeout is not retried: it would cost the whole wait again for each
    // canister.
    if (canisters.length > 1 && !run.problem) {
      const results: GenerateResult[] = []
      for (const canister of canisters) {
        results.push(await runGroup(cli, root, outDir, [canister], timeoutMs))
      }
      return {
        canisters: results.flatMap((result) => result.canisters),
        stderr: results.map((result) => result.stderr).join(""),
      }
    }
    const failure = describeProcess(run, reason)
    return {
      canisters: canisters.map(({ name }) => ({
        name,
        status: "failed",
        omitted: [],
        failure,
      })),
      stderr: "",
    }
  }

  return {
    canisters: canisters.map((canister, index): CanisterOutcome => {
      const entry = entries[index]
      if (entry.status === "failed") {
        return {
          name: canister.name,
          status: "failed",
          omitted: [],
          failure:
            entry.diagnostics.map(formatDiagnostic).join("\n") ||
            "candid-core-cli reported the entry as failed",
        }
      }
      return {
        name: canister.name,
        module: entry.module,
        status: entry.status === "unchanged" ? "unchanged" : "written",
        omitted: entry.omitted,
      }
    }),
    stderr: run.stderr,
  }
}

/**
 * Generate `canisters` with the CLI at `cli`: one process for each output
 * directory, run side by side. Never rejects.
 *
 * Two canisters that would write the same file (the CLI names an output after
 * its `.did`, so `a/ledger.did` and `b/ledger.did` in one `outDir` collide) are
 * refused here, naming both, and the CLI would otherwise refuse the whole run
 * with a usage error.
 */
export async function generate(request: {
  cli: string
  root: string
  canisters: GenerateCanister[]
  timeoutMs: number
}): Promise<GenerateResult> {
  const { cli, root, timeoutMs } = request
  const refused: CanisterOutcome[] = []
  const groups = new Map<string, GenerateCanister[]>()
  const claimed = new Map<string, string>()

  for (const canister of request.canisters) {
    const target = path.join(
      canister.outDir,
      path.basename(canister.didFile, path.extname(canister.didFile)) + ".ts"
    )
    const key = target.toLowerCase()
    const owner = claimed.get(key)
    if (owner !== undefined) {
      refused.push({
        name: canister.name,
        status: "failed",
        omitted: [],
        failure:
          `would write ${path.relative(root, target)}, which "${owner}" already writes. ` +
          `The generator names a module after its .did file: rename one file or give one canister its own outDir`,
      })
      continue
    }
    claimed.set(key, canister.name)
    groups.set(canister.outDir, [
      ...(groups.get(canister.outDir) ?? []),
      canister,
    ])
  }

  const results = await Promise.all(
    [...groups].map(([outDir, members]) =>
      runGroup(cli, root, outDir, members, timeoutMs)
    )
  )
  return {
    canisters: [...refused, ...results.flatMap((result) => result.canisters)],
    stderr: results.map((result) => result.stderr).join(""),
  }
}
