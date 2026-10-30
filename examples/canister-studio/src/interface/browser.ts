// Client only: the Meant compiler in the browser, for a pasted .did
// (the playground), for compatibility checks against pasted text, and for
// reading a live canister when server functions cannot run (StackBlitz).
// `@meantjs/cli` is imported lazily: its 1.9 MB WASM loads on first use
// and never enters the main chunk.
import type { CompatibilityReport } from "@meantjs/cli"
import { sha256Hex } from "../lib/hex.ts"
import {
  compatibilityOf,
  compileInterface,
  moduleOf,
  projectionOf,
  type CandidCli,
} from "./compile.ts"
import { createLiveInterfaceLoader, type LiveLoader } from "./live-loader.ts"
import { agentCandidSource, createMetadataAgent } from "./read-candid.ts"
import type { InterfacePayload } from "./types.ts"

let cli: Promise<CandidCli> | undefined

// In a browser, `init()` with no argument fetches the WASM from the URL the
// bundler gave it.
function browserCli(): Promise<CandidCli> {
  // A failed import or init (an interrupted WASM download) is not kept:
  // the next call tries again instead of failing until a reload.
  cli ??= import("@meantjs/cli")
    .then(async (lib) => {
      await lib.init()
      return lib
    })
    .catch((error: unknown) => {
      cli = undefined
      throw error
    })
  return cli
}

/** Compiles a pasted .did in the browser; the payload's source is `pasted`. */
export async function compileDidInBrowser(
  did: string
): Promise<InterfacePayload> {
  try {
    const compiled = await compileInterface(await browserCli(), did)
    if (!compiled.ok) {
      return compiled.diagnostics === undefined
        ? {
            ok: false,
            canisterId: "",
            code: compiled.code,
            message: compiled.message,
          }
        : {
            ok: false,
            canisterId: "",
            code: compiled.code,
            message: compiled.message,
            diagnostics: compiled.diagnostics,
          }
    }
    return {
      ok: true,
      canisterId: "",
      source: { kind: "pasted", certified: false },
      did,
      didSha256: await sha256Hex(new TextEncoder().encode(did)),
      envelopeJson: compiled.envelopeJson,
      docs: compiled.docs,
      fetchedAt: 0,
      cache: "miss",
      interfaceId: compiled.interfaceId,
      compiledIn: "browser",
    }
  } catch (error) {
    return {
      ok: false,
      canisterId: "",
      code: "compile_failed",
      message: `The compiler could not run in this browser: ${messageOf(error)}`,
    }
  }
}

/** `checkCompatible(written, live)` in the browser. */
export async function checkCompatibleInBrowser(
  written: string,
  live: string
): Promise<CompatibilityReport | { ok: false; message: string }> {
  try {
    return await compatibilityOf(await browserCli(), written, live)
  } catch (error) {
    return {
      ok: false,
      message: `The compiler could not run in this browser: ${messageOf(error)}`,
    }
  }
}

/** `didToModule(did)` in the browser. */
export async function moduleInBrowser(
  did: string
): Promise<{ ok: true; module: string } | { ok: false; message: string }> {
  try {
    const result = await moduleOf(await browserCli(), did)
    return result.ok ? { ok: true, module: result.module } : result
  } catch (error) {
    return {
      ok: false,
      message: `The compiler could not run in this browser: ${messageOf(error)}`,
    }
  }
}

/** `projectDid(did, methods)` in the browser: a pasted .did, projected. */
export async function projectInBrowser(
  did: string,
  methods: readonly string[]
): Promise<
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }
> {
  try {
    return await projectionOf(await browserCli(), did, methods)
  } catch (error) {
    return {
      ok: false,
      message: `The compiler could not run in this browser: ${messageOf(error)}`,
    }
  }
}

let loader: LiveLoader | undefined

/**
 * A live canister's interface read from this browser: the same certified
 * `read_state` (the agent verifies the certificate here against the mainnet
 * root key), the same tmp hack fallback and labels, compiled with the
 * browser's WASM. For when the `fetchInterface` server function cannot be
 * reached; the payload says `compiledIn: "browser"`. Never throws.
 */
export function readInterfaceInBrowser(
  canisterId: string,
  options?: { retry?: boolean }
): Promise<InterfacePayload> {
  loader ??= createLiveInterfaceLoader({
    source: agentCandidSource(createMetadataAgent()),
    compile: async (did) => compileInterface(await browserCli(), did),
    compiledIn: "browser",
  })
  return loader.load(canisterId, options)
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300)
}
