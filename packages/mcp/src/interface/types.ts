// The contract of the interface loader: what the server gets for a canister
// id. Plain data plus the schemas built from the canister's .did.
import type { AnyFieldSchema, AnySchema, MethodMode } from "@meantjs/schema"

/** Where a canister's interface came from, and how far it can be trusted. */
export type InterfaceProvenance =
  /** `candid:service` metadata, read with a certified `read_state`. */
  | {
      readonly kind: "metadata"
      readonly certified: true
      readonly moduleHash: string | null
    }
  /**
   * The `__get_candid_interface_tmp_hack` query: one replica's answer, NOT
   * certified. Only when the certificate proves the metadata absent, or the
   * metadata is readable by the canister's controllers only (a 403).
   */
  | {
      readonly kind: "tmp_hack"
      readonly certified: false
      readonly moduleHash: string | null
      readonly reason: "absent" | "private"
    }
  /** A `.did` file the person named on the command line (`--did`). */
  | { readonly kind: "file"; readonly certified: false; readonly path: string }

/** One callable method. */
export interface MethodInfo {
  readonly name: string
  readonly mode: MethodMode
  readonly args: readonly AnyFieldSchema[]
  readonly results: readonly AnyFieldSchema[]
  /**
   * The method's doc comment in the .did, when it has one: the `///` (or
   * `//`) lines just above it, as the compiler reads them.
   */
  readonly doc?: string
}

export interface CanisterInterface {
  readonly canisterId: string
  readonly provenance: InterfaceProvenance
  /** The .did text. */
  readonly did: string
  /** sha256 of the .did's UTF-8 bytes, hex. */
  readonly didSha256: string
  /** `candid-core:interface:v1:sha256:…`: equal ids, the same interface. */
  readonly interfaceId: string
  /** The service schema: what `client.canister()` takes. */
  readonly actor: AnySchema
  /** Every callable method, by name, in name order. Map-backed: names are canister text. */
  readonly methods: ReadonlyMap<string, MethodInfo>
  /** Declarations and methods the schema loader left out, and why. */
  readonly omitted: readonly {
    readonly kind: "declaration" | "method"
    readonly name: string
    readonly reason: string
    readonly via?: string
  }[]
  /** When it was read or last confirmed by its module hash (ms since the epoch). */
  readonly loadedAt: number
}

export type InterfaceErrorCode =
  | "invalid_canister_id"
  | "management_canister"
  | "no_interface"
  | "private_interface"
  | "canister_not_found"
  | "too_large"
  | "compile_failed"
  | "network"
  | "trust_error"
  | "timeout"
  | "file_error"

export type LoadResult =
  | { readonly ok: true; readonly iface: CanisterInterface }
  | {
      readonly ok: false
      readonly canisterId: string
      readonly code: InterfaceErrorCode
      readonly message: string
      readonly diagnostics?: readonly {
        readonly code: string
        readonly message: string
      }[]
    }

export interface LoadOptions {
  /**
   * Confirm the module hash against the canister now, whatever the cache's
   * age, and fail rather than answer from the cache when that read fails.
   * For a write: the call is built from the interface of the module that is
   * installed when the person is asked.
   */
  readonly fresh?: boolean
}

export interface InterfaceLoader {
  /** A canister's interface, cached; never throws. */
  load(canisterId: string, options?: LoadOptions): Promise<LoadResult>
  /** The method's part of the .did (the method and every type it uses), cached. */
  methodDid(
    iface: CanisterInterface,
    method: string
  ): Promise<
    | { readonly ok: true; readonly did: string }
    | { readonly ok: false; readonly message: string }
  >
  /** Stops the compiler worker. */
  close(): Promise<void>
}
