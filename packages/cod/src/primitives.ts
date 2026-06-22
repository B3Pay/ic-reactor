/**
 * Candid Codec — Primitive Factories
 *
 * One factory per Candid primitive type. Each returns a concrete
 * `CandidCodec<T>` whose `toIDL()` delegates to the matching `IDL.*`.
 */

import { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { CandidCodec } from "./codec"
import type { CandidMetadata, CandidValidationFormat } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Generic Primitive Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A codec backed by a fixed IDL type instance.
 * Used for all leaf / primitive Candid types.
 */
export class CandidPrimitiveCodec<
  T,
  K extends string = string,
> extends CandidCodec<T> {
  readonly kind: K

  constructor(
    kind: K,
    private readonly _idl: IDL.Type<T>,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
    this.kind = kind
  }

  toIDL(): IDL.Type<T> {
    return this._idl
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidPrimitiveCodec(this.kind, this._idl, metadata) as this
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Candid `text` → `string` */
export function text(): CandidPrimitiveCodec<string, "text"> {
  return new CandidPrimitiveCodec("text", IDL.Text)
}

export const BUILT_IN_TEXT_FORMATS: Readonly<
  Record<string, CandidValidationFormat>
> = {
  email: {
    type: "email",
    regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    jsonSchemaFormat: "email",
    errorMessage: "Must be a valid email address",
  },
  "date-time": {
    type: "date-time",
    regex:
      "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    jsonSchemaFormat: "date-time",
    errorMessage: "Must be a valid ISO datetime",
  },
  datetime: {
    type: "datetime",
    regex:
      "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    jsonSchemaFormat: "date-time",
    errorMessage: "Must be a valid ISO datetime",
  },
  date: {
    type: "date",
    regex: "^\\d{4}-\\d{2}-\\d{2}$",
    jsonSchemaFormat: "date",
    errorMessage: "Must be a valid ISO date",
  },
  time: {
    type: "time",
    regex: "^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?$",
    errorMessage: "Must be a valid ISO time",
  },
  duration: {
    type: "duration",
    regex:
      "^P(?=\\d|T\\d)(?:(\\d+)Y)?(?:(\\d+)M)?(?:(\\d+)W)?(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?)?$",
    jsonSchemaFormat: "duration",
    errorMessage: "Must be a valid ISO duration",
  },
  url: {
    type: "url",
    regex: "^[a-zA-Z][a-zA-Z\\d+.-]*:.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid URL",
  },
  uri: {
    type: "uri",
    regex: "^[a-zA-Z][a-zA-Z\\d+.-]*:.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid URI",
  },
  httpsUrl: {
    type: "httpsUrl",
    regex: "^https://.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid HTTPS URL",
  },
  httpUrl: {
    type: "httpUrl",
    regex: "^https?://.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid HTTP(S) URL",
  },
  hostname: {
    type: "hostname",
    regex:
      "^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$",
    errorMessage: "Must be a valid hostname",
  },
  e164: {
    type: "e164",
    regex: "^\\+[1-9]\\d{6,14}$",
    errorMessage: "Must be a valid E.164 phone number",
  },
  ipv4: {
    type: "ipv4",
    regex: "^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.|$)){4}$",
    jsonSchemaFormat: "ipv4",
    errorMessage: "Must be a valid IPv4 address",
  },
  ipv6: {
    type: "ipv6",
    regex:
      "^((?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|::1|::|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6}))$",
    jsonSchemaFormat: "ipv6",
    errorMessage: "Must be a valid IPv6 address",
  },
  uuid: {
    type: "uuid",
    regex:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    jsonSchemaFormat: "uuid",
    errorMessage: "Must be a valid UUID",
  },
  guid: {
    type: "guid",
    regex:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    jsonSchemaFormat: "uuid",
    errorMessage: "Must be a valid GUID",
  },
  base64: {
    type: "base64",
    regex: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
    contentEncoding: "base64",
    errorMessage: "Must be valid base64",
  },
  base64url: {
    type: "base64url",
    regex: "^[A-Za-z0-9_-]+$",
    errorMessage: "Must be valid base64url",
  },
  hex: {
    type: "hex",
    regex: "^(?:[0-9a-fA-F]{2})*$",
    errorMessage: "Must be valid hexadecimal",
  },
  jwt: {
    type: "jwt",
    regex: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
    errorMessage: "Must be a valid JWT",
  },
  cuid: {
    type: "cuid",
    regex: "^c[a-z0-9]{24}$",
    errorMessage: "Must be a valid CUID",
  },
  cuid2: {
    type: "cuid2",
    regex: "^[a-z][a-z0-9]*$",
    errorMessage: "Must be a valid CUID2",
  },
  ulid: {
    type: "ulid",
    regex: "^[0-9A-HJKMNP-TV-Z]{26}$",
    errorMessage: "Must be a valid ULID",
  },
  nanoid: {
    type: "nanoid",
    regex: "^[A-Za-z0-9_-]{21}$",
    errorMessage: "Must be a valid nanoid",
  },
  emoji: {
    type: "emoji",
    regex: "^\\p{Extended_Pictographic}+$",
    errorMessage: "Must contain only emoji characters",
  },
  cidrv4: {
    type: "cidrv4",
    regex:
      "^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)/(?:3[0-2]|[12]?\\d)$",
    errorMessage: "Must be a valid IPv4 CIDR range",
  },
  cidrv6: {
    type: "cidrv6",
    regex: "^[0-9A-Fa-f:]+/(?:12[0-8]|1[01]\\d|\\d?\\d)$",
    errorMessage: "Must be a valid IPv6 CIDR range",
  },
  mac: {
    type: "mac",
    regex: "^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$",
    errorMessage: "Must be a valid MAC address",
  },
  md5: {
    type: "md5",
    regex: "^[0-9a-fA-F]{32}$",
    errorMessage: "Must be a valid MD5 hash",
  },
  sha1: {
    type: "sha1",
    regex: "^[0-9a-fA-F]{40}$",
    errorMessage: "Must be a valid SHA-1 hash",
  },
  sha256: {
    type: "sha256",
    regex: "^[0-9a-fA-F]{64}$",
    errorMessage: "Must be a valid SHA-256 hash",
  },
  sha384: {
    type: "sha384",
    regex: "^[0-9a-fA-F]{96}$",
    errorMessage: "Must be a valid SHA-384 hash",
  },
  sha512: {
    type: "sha512",
    regex: "^[0-9a-fA-F]{128}$",
    errorMessage: "Must be a valid SHA-512 hash",
  },
}

function textFormat(
  format: CandidValidationFormat,
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return text().meta({
    validation: {
      format: errorMessage ? { ...format, errorMessage } : format,
    },
  })
}

export function email(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.email, errorMessage)
}

export function dateTime(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS["date-time"], errorMessage)
}

export function datetime(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.datetime, errorMessage)
}

export function date(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.date, errorMessage)
}

export function time(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.time, errorMessage)
}

export function duration(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.duration, errorMessage)
}

export function url(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.url, errorMessage)
}

export function uri(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.uri, errorMessage)
}

export function httpsUrl(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.httpsUrl, errorMessage)
}

export function httpUrl(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.httpUrl, errorMessage)
}

export function hostname(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.hostname, errorMessage)
}

export function e164(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.e164, errorMessage)
}

export function ipv4(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.ipv4, errorMessage)
}

export function ipv6(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.ipv6, errorMessage)
}

export function uuid(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.uuid, errorMessage)
}

export function guid(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.guid, errorMessage)
}

export function base64(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.base64, errorMessage)
}

export function base64url(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.base64url, errorMessage)
}

export function hex(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.hex, errorMessage)
}

export function jwt(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.jwt, errorMessage)
}

export function cuid(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.cuid, errorMessage)
}

export function cuid2(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.cuid2, errorMessage)
}

export function ulid(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.ulid, errorMessage)
}

export function nanoid(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.nanoid, errorMessage)
}

export function emoji(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.emoji, errorMessage)
}

export function cidrv4(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.cidrv4, errorMessage)
}

export function cidrv6(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.cidrv6, errorMessage)
}

export function mac(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS.mac, errorMessage)
}

export function hash(
  algorithm: "md5" | "sha1" | "sha256" | "sha384" | "sha512",
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return textFormat(BUILT_IN_TEXT_FORMATS[algorithm], errorMessage)
}

export function md5(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return hash("md5", errorMessage)
}

export function sha1(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return hash("sha1", errorMessage)
}

export function sha256(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return hash("sha256", errorMessage)
}

export function sha384(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return hash("sha384", errorMessage)
}

export function sha512(
  errorMessage?: string
): CandidPrimitiveCodec<string, "text"> {
  return hash("sha512", errorMessage)
}

/** Candid `bool` → `boolean` */
export function bool(): CandidPrimitiveCodec<boolean, "bool"> {
  return new CandidPrimitiveCodec("bool", IDL.Bool)
}

/** Candid `nat` → `bigint` */
export function nat(): CandidPrimitiveCodec<bigint, "nat"> {
  return new CandidPrimitiveCodec("nat", IDL.Nat as any)
}

/** Candid `nat8` → `number` */
export function nat8(): CandidPrimitiveCodec<number, "nat8"> {
  return new CandidPrimitiveCodec("nat8", IDL.Nat8 as any)
}

/** Candid `nat16` → `number` */
export function nat16(): CandidPrimitiveCodec<number, "nat16"> {
  return new CandidPrimitiveCodec("nat16", IDL.Nat16 as any)
}

/** Candid `nat32` → `number` */
export function nat32(): CandidPrimitiveCodec<number, "nat32"> {
  return new CandidPrimitiveCodec("nat32", IDL.Nat32 as any)
}

/** Candid `nat64` → `bigint` */
export function nat64(): CandidPrimitiveCodec<bigint, "nat64"> {
  return new CandidPrimitiveCodec("nat64", IDL.Nat64 as any)
}

/** Candid `int` → `bigint` */
export function int(): CandidPrimitiveCodec<bigint, "int"> {
  return new CandidPrimitiveCodec("int", IDL.Int as any)
}

/** Candid `int8` → `number` */
export function int8(): CandidPrimitiveCodec<number, "int8"> {
  return new CandidPrimitiveCodec("int8", IDL.Int8 as any)
}

/** Candid `int16` → `number` */
export function int16(): CandidPrimitiveCodec<number, "int16"> {
  return new CandidPrimitiveCodec("int16", IDL.Int16 as any)
}

/** Candid `int32` → `number` */
export function int32(): CandidPrimitiveCodec<number, "int32"> {
  return new CandidPrimitiveCodec("int32", IDL.Int32 as any)
}

/** Candid `int64` → `bigint` */
export function int64(): CandidPrimitiveCodec<bigint, "int64"> {
  return new CandidPrimitiveCodec("int64", IDL.Int64 as any)
}

/** Candid `float32` → `number` */
export function float32(): CandidPrimitiveCodec<number, "float32"> {
  return new CandidPrimitiveCodec("float32", IDL.Float32 as any)
}

/** Candid `float64` → `number` */
export function float64(): CandidPrimitiveCodec<number, "float64"> {
  return new CandidPrimitiveCodec("float64", IDL.Float64 as any)
}

/** Candid `principal` → `Principal` */
export function principal(): CandidPrimitiveCodec<Principal, "principal"> {
  return new CandidPrimitiveCodec("principal", IDL.Principal)
}

/**
 * Candid `null` → `null`
 *
 * Named `null_` to avoid clashing with the JS keyword.
 * Exported as both `null_` and re-aliased to `null` in the `c` namespace.
 */
export function null_(): CandidPrimitiveCodec<null, "null"> {
  return new CandidPrimitiveCodec("null", IDL.Null)
}

/** Candid `reserved` → `any` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reserved(): CandidPrimitiveCodec<any, "reserved"> {
  return new CandidPrimitiveCodec("reserved", IDL.Reserved)
}

/** Candid `empty` → `never` */
export function empty(): CandidPrimitiveCodec<never, "empty"> {
  return new CandidPrimitiveCodec("empty", IDL.Empty)
}

/**
 * Candid `blob` → `Uint8Array | number[]`
 *
 * Internally represented as `IDL.Vec(IDL.Nat8)` which is the standard
 * Candid blob encoding.
 */
export function blob(): CandidPrimitiveCodec<Uint8Array | number[], "blob"> {
  return new CandidPrimitiveCodec(
    "blob",
    IDL.Vec(IDL.Nat8) as unknown as IDL.Type<Uint8Array | number[]>
  )
}
