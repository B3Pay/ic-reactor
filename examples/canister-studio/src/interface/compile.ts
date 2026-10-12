// The compile steps shared by the server (live canisters) and the browser
// (pasted .did text, and the fallback when server functions cannot run).
// Each takes the `@candid-core/cli` functions as an argument, so this module
// never imports the 1.9 MB WASM library itself: the server passes its
// initialised copy, the browser a lazily imported one.
import type {
  CheckFailure,
  CompatibilityReport,
  Diagnostic,
  didToContract,
  didToModule,
  checkCompatible,
  projectDid,
} from "@candid-core/cli"
import { schemaFromContract } from "@candid-core/schema/contract"
import { methodDocsFromModule } from "./docs.ts"
import type { CanisterInterface, InterfaceErrorCode } from "./types.ts"

/** The `@candid-core/cli` functions the compile steps use. */
export interface CandidCli {
  didToContract: typeof didToContract
  didToModule: typeof didToModule
  projectDid: typeof projectDid
  checkCompatible: typeof checkCompatible
}

/**
 * The largest .did read from a canister or pasted. The largest public
 * interface on mainnet (Internet Identity) is about 100 KB; the compiler
 * runs synchronously, and a hostile 256 KiB .did still compiles (or is
 * refused) in about a second, where 600 KiB blocked for over 11 s.
 */
export const MAX_DID_BYTES = 256 * 1024

/** At most this many compiler diagnostics travel to the browser. */
const MAX_DIAGNOSTICS = 20
/** And each message is cut to this many characters. */
const MAX_MESSAGE = 300

export type CompileFailure = {
  ok: false
  code: Extract<
    InterfaceErrorCode,
    "compile_failed" | "no_interface" | "too_large"
  >
  message: string
  diagnostics?: { code: string; message: string }[]
}

/** A compiled interface: everything a payload needs, as plain data. */
export type CompiledInterface = {
  ok: true
  /** The compact JSON of the `didToContract` envelope. */
  envelopeJson: string
  /** `candid-core:interface:v1:sha256:…`: equal ids, the same interface. */
  interfaceId: string
  docs: Record<string, string>
  omitted: CanisterInterface["omitted"]
}

const encoder = new TextEncoder()

/** The UTF-8 size of a text, which is what the cap counts. */
export function utf8Length(text: string): number {
  return encoder.encode(text).length
}

/** The cap check, as the failure it gives (or `undefined` within the cap). */
export function tooLarge(did: string): CompileFailure | undefined {
  const bytes = utf8Length(did)
  if (bytes <= MAX_DID_BYTES) return undefined
  return {
    ok: false,
    code: "too_large",
    message: `The interface is ${bytes} bytes; the studio compiles at most ${MAX_DID_BYTES} bytes.`,
  }
}

/**
 * Compiles a .did to the envelope the browser rebuilds schemas from, checks
 * that `schemaFromContract` accepts it and that it declares a service, and
 * reads its method docs. Never throws for a bad .did: the compiler's
 * diagnostics come back as a `compile_failed` failure.
 */
export async function compileInterface(
  cli: CandidCli,
  did: string
): Promise<CompiledInterface | CompileFailure> {
  const large = tooLarge(did)
  if (large !== undefined) return large

  const envelope = await cli.didToContract(did)
  if (!("contract" in envelope)) {
    return {
      ok: false,
      code: "compile_failed",
      message: "The interface's Candid did not compile.",
      diagnostics: summarize(envelope.diagnostics),
    }
  }
  // Validate once here, so a payload that leaves the server always loads;
  // the browser repeats it (1 to 4 ms) to get schemas of its own.
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
  return {
    ok: true,
    envelopeJson: JSON.stringify(envelope),
    interfaceId: interfaceIdOf(envelope.contract),
    docs: await docsOf(cli, did),
    omitted: built.omitted.map((o) => ({ ...o })),
  }
}

/** `didToModule(did)`, as a result that never throws. */
export async function moduleOf(
  cli: CandidCli,
  did: string
): Promise<
  | { ok: true; module: string; omitted: CanisterInterface["omitted"] }
  | { ok: false; message: string }
> {
  const large = tooLarge(did)
  if (large !== undefined) return { ok: false, message: large.message }
  const result = await cli.didToModule(did)
  if (!result.ok) {
    return {
      ok: false,
      message: failureMessage(
        "The TypeScript module did not generate",
        result.diagnostics
      ),
    }
  }
  return { ok: true, module: result.module, omitted: result.omitted }
}

/** `projectDid(did, methods)`, as a result that never throws. */
export async function projectionOf(
  cli: CandidCli,
  did: string,
  methods: readonly string[]
): Promise<
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }
> {
  const large = tooLarge(did)
  if (large !== undefined) return { ok: false, message: large.message }
  const result = await cli.projectDid(did, methods)
  if (!result.ok) {
    return {
      ok: false,
      message: failureMessage("The projection failed", result.diagnostics),
    }
  }
  return { ok: true, did: result.did, methods: result.methods }
}

/** `checkCompatible(written, live)`, as a result that never throws. */
export async function compatibilityOf(
  cli: CandidCli,
  written: string,
  live: string
): Promise<CompatibilityReport | { ok: false; message: string }> {
  for (const [side, did] of [
    ["written", written],
    ["live", live],
  ] as const) {
    const large = tooLarge(did)
    if (large !== undefined) {
      return { ok: false, message: `The ${side} interface: ${large.message}` }
    }
  }
  const report: CompatibilityReport | CheckFailure = await cli.checkCompatible(
    written,
    live
  )
  if (report.ok) return report
  const lead =
    report.input === undefined
      ? "The compatibility check could not run"
      : `The ${report.input} interface did not compile`
  return { ok: false, message: failureMessage(lead, report.diagnostics) }
}

/** A failure's diagnostics, bounded for the trip to the browser. */
export function summarize(
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

// Docs come only from `///` comments: without one there are none, and the
// second compile (didToModule) is skipped.
async function docsOf(
  cli: CandidCli,
  did: string
): Promise<Record<string, string>> {
  if (!did.includes("///")) return {}
  const result = await cli.didToModule(did)
  return result.ok ? methodDocsFromModule(result.module) : {}
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
