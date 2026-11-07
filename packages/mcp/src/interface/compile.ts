// The compile steps: a .did to the schemas the server calls with. Each takes
// the `@meantjs/cli` functions as an argument (the worker's, in the server;
// a counting or failing wrapper, in tests), so this module never loads the
// 1.9 MB WASM itself.
import type {
  checkCompatible,
  Diagnostic,
  didToContract,
  didToModule,
  projectDid,
} from "@meantjs/cli"
import {
  serviceMethods,
  type AnySchema,
  type ServiceMethod,
} from "@meantjs/schema"
import { schemaFromContract } from "@meantjs/schema/contract"
import { CompileDeadlineError } from "./compile-worker.ts"
import { methodDocsFromModule } from "./docs.ts"
import type {
  CanisterInterface,
  InterfaceErrorCode,
  MethodInfo,
} from "./types.ts"

/** The `@meantjs/cli` functions the compile steps use. */
export interface CandidCli {
  didToContract: typeof didToContract
  didToModule: typeof didToModule
  projectDid: typeof projectDid
  checkCompatible: typeof checkCompatible
}

/**
 * The largest .did read from a canister or a file. The largest public
 * interface on mainnet (Internet Identity) is about 100 KB and compiles in
 * 30 ms. The cap does not bound compile time by itself: a hostile .did at
 * the cap (19,500 methods `m0 : () -> ();`) compiles in 2.5 s, 5 s with a
 * `///` comment, and its projection takes 4.7 s. The worker's deadline
 * bounds each compiler call.
 */
export const MAX_DID_BYTES = 256 * 1024

/**
 * The most methods an interface may have. Internet Identity, the largest on
 * mainnet, has 113. Past this the schemas and the tool list grow with the
 * canister's whim (19,500 methods made a 906 KB envelope), so a larger
 * interface is refused as too large.
 */
export const MAX_METHODS = 1_000

/** At most this many compiler diagnostics are returned. */
const MAX_DIAGNOSTICS = 20
/** And each message is cut to this many characters. */
const MAX_MESSAGE = 300

export type CompileFailure = {
  readonly ok: false
  readonly code: Extract<
    InterfaceErrorCode,
    "compile_failed" | "no_interface" | "too_large" | "timeout"
  >
  readonly message: string
  readonly diagnostics?: readonly { code: string; message: string }[]
}

/** A compiled interface: the schemas, shared by every canister with the .did. */
export type CompiledInterface = {
  readonly ok: true
  /** `candid-core:interface:v1:sha256:…`: equal ids, the same interface. */
  readonly interfaceId: string
  readonly actor: AnySchema
  readonly methods: ReadonlyMap<string, MethodInfo>
  readonly omitted: CanisterInterface["omitted"]
  /** The length of the envelope's JSON text, which the loader's cache weighs. */
  readonly envelopeLength: number
}

/** The UTF-8 size of a text, which is what the cap counts. */
export function utf8Length(text: string): number {
  return Buffer.byteLength(text, "utf8")
}

/** The cap check, as the failure it gives (or `undefined` within the cap). */
export function tooLarge(did: string): CompileFailure | undefined {
  const bytes = utf8Length(did)
  if (bytes <= MAX_DID_BYTES) return undefined
  return {
    ok: false,
    code: "too_large",
    message: `The interface is ${bytes} bytes; the server compiles at most ${MAX_DID_BYTES} bytes.`,
  }
}

/**
 * Compiles a .did to the schemas the server calls with: checks that
 * `schemaFromContract` accepts the envelope, that it declares a service and
 * that it has at most `MAX_METHODS` methods, and reads its method docs. Never
 * throws for a bad .did: the compiler's diagnostics come back as a
 * `compile_failed` failure, a compile stopped at its deadline as `timeout`.
 * A compiler that cannot run at all still throws.
 */
export async function compileInterface(
  cli: CandidCli,
  did: string
): Promise<CompiledInterface | CompileFailure> {
  const large = tooLarge(did)
  if (large !== undefined) return large

  const envelope = await beforeDeadline(() => cli.didToContract(did))
  if ("deadline" in envelope) {
    return { ok: false, code: "timeout", message: envelope.message }
  }
  if (!("contract" in envelope)) {
    return {
      ok: false,
      code: "compile_failed",
      message: "The interface's Candid did not compile.",
      diagnostics: summarize(envelope.diagnostics),
    }
  }
  // On this thread, unlike the compile: it took 26 ms on the largest
  // envelope the compiler accepts within the cap.
  const built = schemaFromContract(envelope)
  if (!built.ok) {
    return {
      ok: false,
      code: "compile_failed",
      message: "The compiled interface was refused by the schema loader.",
      diagnostics: summarize(built.issues),
    }
  }
  if (built.actor === undefined) {
    return {
      ok: false,
      code: "no_interface",
      message: "The Candid declares no service, so there is nothing to call.",
    }
  }
  const table = serviceMethods(built.actor)
  if (table.size > MAX_METHODS) {
    return {
      ok: false,
      code: "too_large",
      message: `The interface has ${table.size} methods; the server loads at most ${MAX_METHODS}.`,
    }
  }
  return {
    ok: true,
    interfaceId: interfaceIdOf(envelope.contract),
    actor: built.actor,
    methods: methodsOf(table, await docsOf(cli, did)),
    omitted: built.omitted.map((o) => ({ ...o })),
    envelopeLength: JSON.stringify(envelope).length,
  }
}

// The methods of a service, in name order (code point, as the compiler
// orders them), each with its doc when it has one.
function methodsOf(
  table: ReadonlyMap<string, ServiceMethod>,
  docs: ReadonlyMap<string, string>
): Map<string, MethodInfo> {
  const methods = [...table.values()].sort((a, b) =>
    byCodePoint(a.name, b.name)
  )
  return new Map(
    methods.map((m): [string, MethodInfo] => {
      const doc = docs.get(m.name)
      return [
        m.name,
        {
          name: m.name,
          mode: m.mode,
          args: m.args,
          results: m.results,
          ...(doc === undefined ? {} : { doc }),
        },
      ]
    })
  )
}

/** `projectDid(did, methods)`, as a result that never throws for a bad .did. */
export async function projectionOf(
  cli: CandidCli,
  did: string,
  methods: readonly string[]
): Promise<
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }
> {
  const large = tooLarge(did)
  if (large !== undefined) return { ok: false, message: large.message }
  const result = await beforeDeadline(() => cli.projectDid(did, methods))
  if ("deadline" in result) return { ok: false, message: result.message }
  if (!result.ok) {
    return {
      ok: false,
      message: failureMessage("The projection failed", result.diagnostics),
    }
  }
  return { ok: true, did: result.did, methods: result.methods }
}

// A compiler call, or the message of the deadline that stopped it. Any
// other error (a compiler that cannot run) is thrown on.
async function beforeDeadline<T>(
  call: () => Promise<T>
): Promise<T | { deadline: true; message: string }> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof CompileDeadlineError) {
      return { deadline: true, message: error.message }
    }
    throw error
  }
}

// A failure's diagnostics, bounded in count and length.
function summarize(
  items: readonly Pick<Diagnostic, "code" | "message">[]
): { code: string; message: string }[] {
  return items.slice(0, MAX_DIAGNOSTICS).map(({ code, message }) => ({
    code,
    message: message.slice(0, MAX_MESSAGE),
  }))
}

// "<lead>: code: message; …", naming at most three diagnostics.
function failureMessage(
  lead: string,
  diagnostics: readonly Diagnostic[]
): string {
  const first = diagnostics
    .slice(0, 3)
    .map((d) => `${d.code}: ${d.message.slice(0, MAX_MESSAGE)}`)
  const more =
    diagnostics.length > 3 ? ` (and ${diagnostics.length - 3} more)` : ""
  return first.length === 0 ? `${lead}.` : `${lead}: ${first.join("; ")}${more}`
}

// Docs come only from line comments (`///` or `//`): without one there are
// none, and the second compile (didToModule) is skipped. Docs are extras: a
// module that does not generate in time costs them, not the interface.
async function docsOf(
  cli: CandidCli,
  did: string
): Promise<ReadonlyMap<string, string>> {
  if (!did.includes("//")) return new Map()
  const result = await beforeDeadline(() => cli.didToModule(did))
  return "deadline" in result || !result.ok
    ? new Map()
    : methodDocsFromModule(result.module)
}

// `ContractEnvelope.contract` is typed `unknown` on purpose (its shape
// versions independently); this reads one string from it, defensively.
function interfaceIdOf(contract: unknown): string {
  if (typeof contract !== "object" || contract === null) return ""
  const identities: unknown = Reflect.get(contract, "identities")
  if (typeof identities !== "object" || identities === null) return ""
  const id: unknown = Reflect.get(identities, "interface")
  return typeof id === "string" ? id : ""
}

// Code-point order, not `<` (UTF-16 code units, which put an astral
// character before U+E000..U+FFFF) and not localeCompare.
function byCodePoint(a: string, b: string): number {
  const x = a[Symbol.iterator]()
  const y = b[Symbol.iterator]()
  for (;;) {
    const p = x.next()
    const q = y.next()
    if (p.done === true || q.done === true) {
      return p.done === true ? (q.done === true ? 0 : -1) : 1
    }
    const d = (p.value.codePointAt(0) ?? 0) - (q.value.codePointAt(0) ?? 0)
    if (d !== 0) return d
  }
}
