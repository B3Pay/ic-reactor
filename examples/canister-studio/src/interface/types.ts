import type { AnyFieldSchema, AnySchema, MethodMode } from "@candid-core/schema"
import type { RegistryEntry } from "../lib/registry.ts"

/** Where a canister's interface came from, and how far it can be trusted. */
export type InterfaceSource =
  /** A committed .did, generated into a typed module at build time. */
  | { kind: "typed"; module: RegistryEntry["module"] }
  /** The canister's `candid:service` metadata, read with a certified read_state. */
  | { kind: "metadata"; certified: true; moduleHash: string | null }
  /**
   * The `__get_candid_interface_tmp_hack` query: one replica's answer, NOT
   * certified. The UI labels it so.
   */
  | { kind: "tmp_hack"; certified: false; moduleHash: string | null }
  /** A .did the user pasted (the playground). */
  | { kind: "pasted"; certified: false }

/** One method of a canister, ready for a form and a reply viewer. */
export interface MethodInfo {
  name: string
  mode: MethodMode
  args: readonly AnyFieldSchema[]
  results: readonly AnyFieldSchema[]
  /** From didToModule's JSDoc (runtime interfaces) or a typed hint. */
  doc?: string
}

/** A canister's interface, rebuilt from an `InterfacePayload` on either side. */
export interface CanisterInterface {
  canisterId: string
  name: string
  /** The service schema: what `client.canister()` takes. */
  actor: AnySchema
  /** Every callable method, sorted by name. */
  methods: readonly MethodInfo[]
  /** Map-backed: method names are canister text and may be "__proto__". */
  method(name: string): MethodInfo | undefined
  source: InterfaceSource
  did?: string
  didSha256?: string
  /** Declarations and methods the schema loader left out, and why. */
  omitted: readonly {
    kind: "declaration" | "method"
    name: string
    reason: string
    via?: string
  }[]
  registry?: RegistryEntry
}

/**
 * What loaders and server functions return: plain, serializable data (no
 * schemas, no functions), the same on the server and in the browser.
 */
export type InterfacePayload =
  | {
      ok: true
      canisterId: string
      source: InterfaceSource
      did: string
      didSha256: string
      /** The compact `didToContract` envelope JSON; absent for typed canisters. */
      envelopeJson?: string
      /**
       * Method docs by method name (read them with `Object.hasOwn`: the
       * names are canister text).
       */
      docs: Record<string, string>
      /**
       * When the interface was last confirmed against the canister (ms since
       * the epoch): read, or its module hash re-checked unchanged. 0 for
       * typed and pasted interfaces.
       */
      fetchedAt: number
      /**
       * `"hit"`: answered from the loader's cache (at most a module-hash
       * re-check); `"miss"`: read from the canister now; `"typed"`: a
       * registry canister, from the committed .did.
       */
      cache: "hit" | "miss" | "typed"
      /**
       * The compiled interface's identity (`candid-core:interface:v1:…`):
       * equal ids, the same interface. Absent for typed canisters.
       */
      interfaceId?: string
      /**
       * Where the .did was compiled: on the server, or in the browser (a
       * pasted .did, or a live read when server functions were unavailable).
       * Absent for typed canisters.
       */
      compiledIn?: "server" | "browser"
    }
  | {
      ok: false
      canisterId: string
      code: InterfaceErrorCode
      message: string
      diagnostics?: { code: string; message: string }[]
    }

export type InterfaceErrorCode =
  | "invalid_canister_id"
  | "not_a_canister"
  | "management_canister"
  | "no_interface"
  | "private_interface"
  | "canister_not_found"
  | "too_large"
  | "compile_failed"
  | "network"
  | "trust_error"
  | "timeout"
