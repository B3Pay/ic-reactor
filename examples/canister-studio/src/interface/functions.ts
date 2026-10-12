// The interface server functions. Each takes a canister id, never .did text:
// the .did they work on is the one the server read from the canister itself
// (or a registry canister's committed one). Each returns a result object and
// never throws, because an Error crosses the server function boundary as its
// message alone. Server-only code is imported inside the handlers, so the
// client bundle never sees it. Call them through `serverResult`
// (server-result.ts).
import type { CompatibilityReport } from "@candid-core/cli"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { checkCanisterId } from "../lib/ids.ts"
import { registryEntry } from "../lib/registry.ts"
import { MAX_METHODS } from "./compile.ts"
import type {
  CanisterInterface,
  InterfacePayload,
  InterfaceSource,
} from "./types.ts"

/**
 * The most methods one projection takes: every method of the largest
 * interface the studio loads, so "Choose all" always fits.
 */
export const MAX_PROJECT_METHODS = MAX_METHODS
/** The longest method name a projection takes, in UTF-16 code units. */
export const MAX_METHOD_NAME_LENGTH = 1024

// The longest canonical principal text is 63 characters.
const canisterIdText = z.string().max(64)

const canisterInput = z.object({ canisterId: canisterIdText })

// The Project tab keeps within these, so a request past them is not the
// app's: the validator refuses it before the handler runs.
const projectInput = z.object({
  canisterId: canisterIdText,
  methods: z
    .array(z.string().max(MAX_METHOD_NAME_LENGTH))
    .min(1)
    .max(MAX_PROJECT_METHODS),
})

export type GenerateModuleResult =
  | { ok: true; module: string; omitted: CanisterInterface["omitted"] }
  | { ok: false; message: string }

export type ProjectInterfaceResult =
  { ok: true; did: string; methods: string[] } | { ok: false; message: string }

export type LiveCompatibilityResult =
  | { ok: true; report: CompatibilityReport; source: InterfaceSource }
  | { ok: false; message: string }

/**
 * A live canister's interface: certified metadata (or the labelled,
 * uncertified tmp hack), compiled on the server and cached by module hash.
 * Always a live read, registry canisters included (their typed payload
 * comes from `loadInterfacePayload`, which needs no server).
 */
export const fetchInterface = createServerFn({ method: "GET" })
  .validator(canisterInput)
  .handler(async ({ data }): Promise<InterfacePayload> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) {
      return {
        ok: false,
        canisterId: data.canisterId,
        code: id.code,
        message: id.message,
      }
    }
    try {
      const { loadLiveInterface } = await import("./live-candid.server.ts")
      return await loadLiveInterface(id.id)
    } catch (error) {
      return {
        ok: false,
        canisterId: data.canisterId,
        code: "server_error",
        message: failureText("fetchInterface", error),
      }
    }
  })

/**
 * The TypeScript module `didToModule` writes for a canister's interface:
 * for a registry canister its committed .did (the module under
 * src/canisters/), for any other the .did it publishes.
 */
export const generateModule = createServerFn({ method: "GET" })
  .validator(canisterInput)
  .handler(async ({ data }): Promise<GenerateModuleResult> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) return { ok: false, message: id.message }
    try {
      const server = await import("./live-candid.server.ts")
      const did = await didOf(id.id, server.liveDid)
      return did.ok ? await server.moduleForDid(did.did) : did
    } catch (error) {
      return { ok: false, message: failureText("generateModule", error) }
    }
  })

/**
 * A canister's interface projected onto some of its methods (`projectDid`):
 * a self-contained .did with those methods and what they reach. A POST, so
 * a long method list stays out of the URL.
 */
export const projectInterface = createServerFn({ method: "POST" })
  .validator(projectInput)
  .handler(async ({ data }): Promise<ProjectInterfaceResult> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) return { ok: false, message: id.message }
    try {
      const server = await import("./live-candid.server.ts")
      const did = await didOf(id.id, server.liveDid)
      return did.ok ? await server.projectionForDid(did.did, data.methods) : did
    } catch (error) {
      return { ok: false, message: failureText("projectInterface", error) }
    }
  })

/**
 * For a registry canister: its committed .did checked against the one it
 * publishes now (`checkCompatible(committed, live)`), with the provenance of
 * the live one. Runs on the server, so the page needs no 1.9 MB compiler
 * download for it.
 */
export const checkLiveCompatibility = createServerFn({ method: "GET" })
  .validator(canisterInput)
  .handler(async ({ data }): Promise<LiveCompatibilityResult> => {
    const id = checkCanisterId(data.canisterId)
    if (!id.ok) return { ok: false, message: id.message }
    const entry = registryEntry(id.id)
    if (entry === undefined) {
      return {
        ok: false,
        message:
          "Only a registry canister has a committed .did to compare with.",
      }
    }
    try {
      const server = await import("./live-candid.server.ts")
      const live = await server.loadLiveInterface(id.id)
      if (!live.ok) return { ok: false, message: live.message }
      const report = await server.compatibilityForDids(entry.did, live.did)
      return report.ok ? { ok: true, report, source: live.source } : report
    } catch (error) {
      return {
        ok: false,
        message: failureText("checkLiveCompatibility", error),
      }
    }
  })

// A registry canister's committed .did, or the live one.
async function didOf(
  canisterId: string,
  liveDid: (
    id: string
  ) => Promise<{ ok: true; did: string } | { ok: false; message: string }>
): Promise<{ ok: true; did: string } | { ok: false; message: string }> {
  const entry = registryEntry(canisterId)
  return entry === undefined
    ? liveDid(canisterId)
    : { ok: true, did: entry.did }
}

// Only an unexpected failure gets here (a compiler that cannot run, a
// server module that does not load), and its text can carry the server's
// file paths: the error goes to the log, the browser gets a fixed text.
function failureText(name: string, error: unknown): string {
  console.error(`The ${name} server function failed:`, error)
  return "The studio's server failed while doing this; its log has the details."
}
