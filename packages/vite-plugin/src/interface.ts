/**
 * Projection and the live check: `candid-core-cli project` and
 * `candid-core-cli check`, run in a child process as `gen` is (generate.ts).
 *
 * `@candid-core/cli` 0.3.0 also exports both as library functions
 * (`projectDid`, `checkCompatible`), WebAssembly loaded into the calling
 * process. The plugin runs the commands instead, for the reasons it runs `gen`
 * in a child process: the input is a live canister's interface, which the
 * app does not control, and a trap, a runaway loop or a memory blow-up on it
 * ends that process and not the dev server; the process is killed at a
 * deadline, which a call into WebAssembly on the dev server's own thread could
 * not be; and the CLI is the one installed for the app, resolved as `gen`'s
 * is, never one the plugin imports. A failure is then a message for the
 * canister, which follows `failOnError` as a generation failure does. The cost
 * is one Node process (about 70 ms on a ledger's interface) for each step, and
 * the steps run only when a `didFile` is fetched, when a `methods` entry's
 * file changes, and in a live check.
 *
 * The commands read and write files, so each run gets a temporary directory
 * of its own, removed when it ends: the live interface is written there, and
 * the projection written there is read back. Neither command touches the
 * network.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describeError } from "./describe-value.js"
import { describeProcess, formatDiagnostic, runProcess } from "./generate.js"

/** How long one `project` or `check` process may run before it is killed. */
export const INTERFACE_TIMEOUT_MS = 60_000

/**
 * The most output kept from one `project` or `check` process. A check's
 * report is bounded at 4 MiB and 1,016 bytes, and a projection's
 * unknown-method diagnostics at 4 MiB plus the list of the service's methods;
 * a report cut at this bound no longer parses, and the run fails with what
 * the process did.
 */
const MAX_REPORT_BYTES = 16 * 1024 * 1024

/**
 * The names asked for to list a service's methods: the failure of a
 * projection to a method the service lacks lists them. The empty name is one
 * no service can have, since candid-core refuses a service that declares it
 * (`empty_method_name`), so the projection always fails and always lists them.
 * `project` reads `--methods ""` as the empty list, and splits any other value
 * on commas as it is, so two empty names are sent: `--methods ,`.
 */
const NO_METHOD = ["", ""] as const

/** The identities `project` and `check` report for one interface. */
export interface Identities {
  contract_id: string
  interface_id: string
}

/** A diagnostic as the CLI reports it: only `code` and `message` are sure. */
export interface Diagnostic {
  code?: string
  message?: string
  severity?: string
  method?: string
  path?: string
  notes?: string[]
  resource_limit?: { resource?: string; limit?: number; observed?: number }
  unreported_methods?: number
}

/** What every `project` and `check` process shares. */
export interface CliContext {
  /** The CLI's bin script, as `resolveCliBin` found it. */
  cli: string
  /** The working directory: the Vite root. */
  root: string
  timeoutMs?: number
  signal?: AbortSignal
}

/** A run that did not complete. */
export interface Unfinished {
  ok: false
  /** The caller's signal stopped it. */
  stopped?: boolean
  /** The CLI's diagnostics, when it reported any. */
  diagnostics?: Diagnostic[]
  /** What went wrong, in words fit for an error message. */
  message: string
}

/** A projection. */
export type Projection =
  | {
      ok: true
      /** The projected `.did`, as `project` wrote it. */
      did: string
      /** The methods it holds, in name order. */
      methods: string[]
      input: Identities
      projection: Identities
    }
  | Unfinished

/** A service's methods. */
export type MethodList = { ok: true; methods: string[] } | Unfinished

/** A completed check. */
export type Check =
  | {
      ok: true
      /** No diagnostic is an error. */
      compatible: boolean
      written: Identities
      live: Identities
      diagnostics: Diagnostic[]
    }
  | (Unfinished & {
      /** The side that did not compile, when the CLI said. */
      input?: "written" | "live"
    })

/** Where a projection reads from: a `.did` on disk, or a text. */
export type Source = { file: string } | { text: string }

const stopped: Unfinished = { ok: false, stopped: true, message: "was stopped" }

/**
 * Run `run` with a new temporary directory, removed when it settles. Never
 * rejects: an error is a failure.
 */
async function inTemporary<T>(
  run: (dir: string) => Promise<T | Unfinished>
): Promise<T | Unfinished> {
  let dir: string | undefined
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-did-"))
    return await run(dir)
  } catch (error) {
    return { ok: false, message: describeError(error) }
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** `text` written to `live/live.did` in `dir`, alone in its directory. */
function writeLive(dir: string, text: string): string {
  const file = path.join(dir, "live", "live.did")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

/**
 * Run the CLI with `args` and read the JSON document it prints: `document`
 * is `undefined` with `failure` set when there is none to read.
 */
async function runCli(
  context: CliContext,
  args: string[]
): Promise<
  | { document: Record<string, unknown>; failure?: undefined }
  | { document?: undefined; failure: Unfinished }
> {
  const run = await runProcess(
    context.cli,
    args,
    context.root,
    context.timeoutMs ?? INTERFACE_TIMEOUT_MS,
    context.signal,
    undefined,
    MAX_REPORT_BYTES
  )
  if (run.stopped) return { failure: stopped }
  if (!run.problem) {
    try {
      const document: unknown = JSON.parse(run.stdout)
      if (document && typeof document === "object") {
        return { document: document as Record<string, unknown> }
      }
    } catch {
      // Not a report: said below, with how the process ended.
    }
  }
  return {
    failure: {
      ok: false,
      message: describeProcess(
        run,
        run.problem ? undefined : "it printed no report"
      ),
    },
  }
}

const diagnosticsOf = (document: Record<string, unknown>): Diagnostic[] =>
  Array.isArray(document.diagnostics)
    ? (document.diagnostics as Diagnostic[])
    : []

/** The CLI's own failure document, as one message. */
function failureOf(document: Record<string, unknown>): Unfinished {
  const diagnostics = diagnosticsOf(document)
  return {
    ok: false,
    diagnostics,
    message:
      diagnostics.map(formatDiagnostic).join("\n") ||
      "candid-core-cli reported a failure with no diagnostic",
  }
}

/**
 * Project `source` onto `methods` with `candid-core-cli project`: the `.did`
 * holding those methods and every declaration they reach. Never rejects.
 *
 * `project` takes the names separated by commas, so a name with a comma in it
 * cannot be asked for: the caller refuses one first.
 */
export function project(
  context: CliContext,
  source: Source,
  methods: readonly string[]
): Promise<Projection> {
  return inTemporary(async (dir) => {
    const input = "file" in source ? source.file : writeLive(dir, source.text)
    const output = path.join(dir, "out", "projection.did")
    const { document, failure } = await runCli(context, [
      "project",
      input,
      "--methods",
      methods.join(","),
      "-o",
      output,
      "--json",
    ])
    if (!document) return failure
    if (document.ok !== true) return failureOf(document)
    return {
      ok: true,
      did: fs.readFileSync(output, "utf-8"),
      methods: (document.methods as string[] | undefined) ?? [],
      input: document.input as Identities,
      projection: document.projection as Identities,
    }
  })
}

/**
 * The methods of the service `source` declares, in name order. A projection
 * to a method the service lacks fails, and its first diagnostic lists them:
 * it is asked for the empty name, which no service has (`NO_METHOD`). Any
 * other outcome is a failure, which the caller must report: a list that could
 * not be read is never an empty one. Never rejects.
 */
export async function listMethods(
  context: CliContext,
  source: Source
): Promise<MethodList> {
  const result = await project(context, source, NO_METHOD)
  if (result.ok) {
    return {
      ok: false,
      message: `candid-core-cli project accepted the empty method name, which no service can have, so its methods cannot be listed`,
    }
  }
  const [first] = result.diagnostics ?? []
  if (first?.code === "unknown_method" && Array.isArray(first.notes)) {
    return { ok: true, methods: first.notes.map(String) }
  }
  // A file of declarations alone: a service of no methods.
  if (first?.code === "no_service") return { ok: true, methods: [] }
  return result
}

/**
 * Check with `candid-core-cli check` that the live interface `live` is still
 * compatible with the `.did` at `written`. Never rejects.
 */
export function check(
  context: CliContext,
  written: string,
  live: string
): Promise<Check> {
  return inTemporary(async (dir): Promise<Check> => {
    const { document, failure } = await runCli(context, [
      "check",
      written,
      "--against",
      writeLive(dir, live),
      "--json",
    ])
    if (!document) return failure
    if (document.ok !== true) {
      const input = document.input
      return {
        ...failureOf(document),
        input: input === "written" || input === "live" ? input : undefined,
      }
    }
    return {
      ok: true,
      compatible: document.compatible === true,
      written: document.written as Identities,
      live: document.live as Identities,
      diagnostics: diagnosticsOf(document),
    }
  })
}

/**
 * One line for a finding of a check, naming its method, its code and where in
 * the method's type it is.
 */
export function describeFinding(finding: Diagnostic): string {
  const { code = "finding", message = "", path: at, resource_limit } = finding
  if (finding.method === undefined) {
    // The one finding that names no method: the report reached its bound.
    const count = finding.unreported_methods ?? 0
    return (
      `${count} more method${count === 1 ? "" : "s"} not reported (${code}` +
      `${resource_limit?.resource ? `, ${resource_limit.resource}` : ""}): ${message}`
    )
  }
  const bound =
    code === "resource_limit_exceeded" && resource_limit?.resource
      ? ` (${resource_limit.resource}: limit ${resource_limit.limit}, observed ${resource_limit.observed})`
      : ""
  return `${finding.method}: ${code}${at ? ` at ${at}` : ""}${bound}: ${message}`
}

/**
 * `lines` with at most `max` of them, and a last one that counts the rest.
 * A check reports up to 4 MiB of findings: a message lists the first ones.
 */
export function firstLines(lines: string[], max = 20): string[] {
  if (lines.length <= max) return lines
  return [...lines.slice(0, max), `… and ${lines.length - max} more`]
}
