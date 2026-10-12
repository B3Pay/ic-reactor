// The server's live interface loader: one per server process, so its caches
// serve every request. Server only (the compiler reads its WASM from disk);
// functions.ts imports it inside its handlers, and scripts/smoke.ts directly.
import type { CompatibilityReport } from "@candid-core/cli"
import {
  compatibilityOf,
  compileInterface,
  moduleOf,
  projectionOf,
} from "./compile.ts"
import { serverCli } from "./compile.server.ts"
import { createLiveInterfaceLoader, type LiveLoader } from "./live-loader.ts"
import { agentCandidSource, createMetadataAgent } from "./read-candid.ts"
import type { CanisterInterface, InterfacePayload } from "./types.ts"

let loader: LiveLoader | undefined

function serverLoader(): LiveLoader {
  loader ??= createLiveInterfaceLoader({
    source: agentCandidSource(createMetadataAgent()),
    compile: (did) => compileInterface(serverCli, did),
    compiledIn: "server",
  })
  return loader
}

/**
 * A live canister's interface payload: certified `candid:service` metadata
 * (or the labelled, uncertified tmp hack), compiled here and cached by
 * module hash. Never throws.
 */
export function loadLiveInterface(
  canisterId: string
): Promise<InterfacePayload> {
  return serverLoader().load(canisterId)
}

/**
 * The .did a live canister publishes, through the same cache, or why there
 * is none. The server functions work on this text only: never on .did text
 * sent by a browser.
 */
export async function liveDid(
  canisterId: string
): Promise<{ ok: true; did: string } | { ok: false; message: string }> {
  const payload = await loadLiveInterface(canisterId)
  return payload.ok
    ? { ok: true, did: payload.did }
    : { ok: false, message: payload.message }
}

/** `didToModule` over a .did the server already holds. */
export function moduleForDid(
  did: string
): Promise<
  | { ok: true; module: string; omitted: CanisterInterface["omitted"] }
  | { ok: false; message: string }
> {
  return moduleOf(serverCli, did)
}

/** `projectDid` over a .did the server already holds. */
export function projectionForDid(
  did: string,
  methods: readonly string[]
): Promise<
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }
> {
  return projectionOf(serverCli, did, methods)
}

/** `checkCompatible` over two .did texts the server already holds. */
export function compatibilityForDids(
  written: string,
  live: string
): Promise<CompatibilityReport | { ok: false; message: string }> {
  return compatibilityOf(serverCli, written, live)
}
