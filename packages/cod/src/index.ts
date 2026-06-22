/**
 * Candid Codec — Public API
 *
 * The `c` namespace is the primary entry point for the codec layer.
 *
 * @example
 * ```ts
 * import { c } from "@ic-reactor/cod"
 *
 * const Account = c.record({
 *   owner: c.principal(),
 *   subaccount: c.opt(c.blob()),
 * })
 *
 * type Account = c.infer<typeof Account>
 * ```
 */

// Re-export classes and types for advanced consumers
export { CandidCodec } from "./codec"
export { CandidPrimitiveCodec } from "./primitives"
export {
  CandidOptCodec,
  CandidVecCodec,
  CandidRecordCodec,
  CandidVariantCodec,
  CandidTupleCodec,
} from "./composites"
export { CandidMethodCodec, CandidServiceCodec } from "./service"
export type {
  CandidMetadata,
  CandidValidationMetadata,
  CandidValidationBound,
  CandidValidationFormat,
  CandidMethodManifest,
  CandidFieldManifest,
  CandidServiceManifest,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// `c` Namespace
// ─────────────────────────────────────────────────────────────────────────────

import {
  base64,
  base64url,
  text,
  pattern,
  cidrv4,
  cidrv6,
  cuid,
  cuid2,
  date,
  dateTime,
  datetime,
  duration,
  e164,
  email,
  emoji,
  guid,
  hash,
  hex,
  hostname,
  httpUrl,
  httpsUrl,
  ipv4,
  ipv6,
  jwt,
  mac,
  md5,
  nanoid,
  regex,
  sha1,
  sha256,
  sha384,
  sha512,
  time,
  ulid,
  uri,
  url,
  uuid,
  bool,
  nat,
  nat8,
  nat16,
  nat32,
  nat64,
  int,
  int8,
  int16,
  int32,
  int64,
  float32,
  float64,
  principal,
  null_,
  reserved,
  empty,
  blob,
} from "./primitives"

import { opt, vec, record, variant, tuple } from "./composites"
import { query, update, oneway, service } from "./service"
import type { Infer } from "./service"

const iso = {
  date,
  time,
  datetime,
  duration,
} as const

/**
 * The `c` namespace — Zod-inspired Candid codec builder.
 *
 * Usage mirrors the plan's target API:
 * ```ts
 * const Account = c.record({ owner: c.principal(), ... })
 * type Account = c.infer<typeof Account>
 * ```
 *
 * The namespace merges a const object (runtime factories) with a TypeScript
 * namespace (type-level utilities like `c.infer` and `c.ServiceOf`).
 */
export const c = {
  // Primitives
  text,
  regex,
  pattern,
  email,
  dateTime,
  datetime,
  date,
  time,
  duration,
  iso,
  e164,
  url,
  uri,
  httpUrl,
  httpsUrl,
  hostname,
  ipv4,
  ipv6,
  jwt,
  uuid,
  guid,
  base64,
  base64url,
  hex,
  hash,
  md5,
  sha1,
  sha256,
  sha384,
  sha512,
  cuid,
  cuid2,
  ulid,
  nanoid,
  emoji,
  cidrv4,
  cidrv6,
  mac,
  bool,
  nat,
  nat8,
  nat16,
  nat32,
  nat64,
  int,
  int8,
  int16,
  int32,
  int64,
  float32,
  float64,
  principal,
  null: null_,
  reserved,
  empty,
  blob,

  // Composites
  opt,
  vec,
  record,
  variant,
  tuple,

  // Service / Method
  query,
  update,
  oneway,
  service,
} as const

/**
 * Merged namespace providing type-level utilities:
 *
 * - `c.infer<typeof SomeCodec>` → infer the TS type from a codec
 * - `c.ServiceOf<typeof SomeService>` → infer the actor interface
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace c {
  /** Infer the TypeScript type represented by a codec. */
  export type infer<T> = Infer<T>

  /** Infer the actor-like interface from a service codec. */
  export type ServiceOf<T> = import("./service").ServiceOf<T>
}
