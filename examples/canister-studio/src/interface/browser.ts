// STUB (FOUNDATION): the signatures are the contract; B4 implements them.
// Client only: each function lazily imports @candid-core/cli (its WASM is
// 1.9 MB) on first use.
import type { CompatibilityReport } from "@candid-core/cli"
import type { InterfacePayload } from "./types.ts"

/** Compiles a pasted .did in the browser; the payload's source is `pasted`. */
export async function compileDidInBrowser(
  did: string
): Promise<InterfacePayload> {
  void did
  return {
    ok: false,
    canisterId: "",
    code: "compile_failed",
    message: "not implemented",
  }
}

/** `checkCompatible(written, live)` in the browser. */
export async function checkCompatibleInBrowser(
  written: string,
  live: string
): Promise<CompatibilityReport | { ok: false; message: string }> {
  void written
  void live
  return { ok: false, message: "not implemented" }
}

/** `didToModule(did)` in the browser. */
export async function moduleInBrowser(
  did: string
): Promise<{ ok: true; module: string } | { ok: false; message: string }> {
  void did
  return { ok: false, message: "not implemented" }
}
