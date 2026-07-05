import type { PrincipalLike } from "../index.js"
import { Schema, type SchemaOps } from "./core.js"
import type { BlobLike } from "./types.js"
import {
  assertByte,
  base64ToBytes,
  blobToBytes,
  bytesToBase64,
  bytesToCandidBlob,
  bytesToHex,
  hexToBytes,
  principalToText,
} from "./utils.js"

/**
 * Schema implementation for Candid `principal` values.
 */
export class PrincipalSchema extends Schema<PrincipalLike, PrincipalLike> {
  /**
   * Exposes principals as text in application code while preserving `principal` on the wire.
   *
   * @returns Schema that accepts and returns principal text.
   */
  asText(): Schema<PrincipalLike, string> {
    return this.codec<string>({
      name: "principal.asText",
      encode: (value) => value,
      decode: (value) => principalToText(value),
    })
  }
}

/**
 * Schema implementation for Candid `blob` values.
 */
export class BlobSchema extends Schema<BlobLike, BlobLike> {
  /**
   * Exposes blobs as lowercase hexadecimal strings in application code.
   *
   * @returns Schema that accepts hex strings and decodes blobs to hex strings.
   * @throws If an encoded hex string is not even-length hexadecimal text.
   */
  asHex(): Schema<BlobLike, string> {
    return this.codec<string>({
      name: "blob.asHex",
      encode: hexToBytes,
      decode: (value) => bytesToHex(blobToBytes(value)),
    })
  }

  /**
   * Exposes blobs as base64 strings in application code.
   *
   * @returns Schema that accepts base64 strings and decodes blobs to base64 strings.
   */
  asBase64(): Schema<BlobLike, string> {
    return this.codec<string>({
      name: "blob.asBase64",
      encode: base64ToBytes,
      decode: (value) => bytesToBase64(blobToBytes(value)),
    })
  }
}

/**
 * Schema implementation shared by unbounded Candid integer types.
 *
 * @typeParam Kind - The Candid integer kind represented by the schema.
 */
export class BigIntSchema<Kind extends "nat" | "int"> extends Schema<
  bigint,
  bigint
> {
  /** Candid integer kind represented by this schema. */
  readonly kind: Kind

  /**
   * Creates a bigint-backed Candid integer schema.
   *
   * @param kind - Integer kind to represent.
   */
  constructor(kind: Kind) {
    super(bigIntOps(kind))
    this.kind = kind
  }

  /**
   * Exposes bigint values as decimal strings in application code.
   *
   * @returns Schema that accepts decimal strings and decodes integer values to strings.
   * @throws If a `nat` string encodes a negative value.
   */
  asString(): Schema<bigint, string> {
    return this.codec<string>({
      name: `${this.kind}.asString`,
      encode: (value) => {
        const parsed = BigInt(value)
        if (this.kind === "nat" && parsed < 0n) {
          throw new Error("nat string codec cannot encode a negative value")
        }
        return parsed
      },
      decode: (value) => value.toString(),
    })
  }
}

/**
 * Creates a schema for the Candid `null` type.
 *
 * @returns Schema that only accepts and returns `null`.
 * @throws If an app value other than `null` is encoded.
 */
export function null_(): Schema<null, null> {
  return new Schema<null, null>({
    did: () => "null",
    toWire: (value) => {
      if (value !== null) {
        throw new Error("null schema can only encode null")
      }
      return null
    },
    fromWire: () => null,
    wireToText: () => "null",
    textToWire: (parser) => {
      parser.expectWord("null")
      return null
    },
    codecs: [],
  })
}

/**
 * Creates a schema for the Candid `bool` type.
 *
 * @returns Boolean schema.
 */
export function bool(): Schema<boolean, boolean> {
  return new Schema<boolean, boolean>({
    did: () => "bool",
    toWire: (value) => value,
    fromWire: (value) => value,
    wireToText: (value) => (value ? "true" : "false"),
    textToWire: (parser) => {
      if (parser.consumeWord("true")) return true
      parser.expectWord("false")
      return false
    },
    codecs: [],
  })
}

/**
 * Creates a schema for the Candid `text` type.
 *
 * @returns String schema.
 */
export function text(): Schema<string, string> {
  return new Schema<string, string>({
    did: () => "text",
    toWire: (value) => value,
    fromWire: (value) => value,
    wireToText: (value) => JSON.stringify(value),
    textToWire: (parser) => parser.parseQuotedText(),
    codecs: [],
  })
}

/**
 * Creates a schema for the Candid `principal` type.
 *
 * @returns Principal schema.
 */
export function principal(): PrincipalSchema {
  return new PrincipalSchema({
    did: () => "principal",
    toWire: (value) => value,
    fromWire: (value) => value,
    wireToText: (value) =>
      `principal ${JSON.stringify(principalToText(value))}`,
    textToWire: (parser) => {
      parser.expectWord("principal")
      return parser.parseQuotedText()
    },
    codecs: [],
  })
}

/**
 * Creates a schema for the Candid `blob` shorthand type.
 *
 * @returns Blob schema backed by bytes or byte arrays.
 */
export function blob(): BlobSchema {
  return new BlobSchema({
    did: () => "blob",
    toWire: (value) => value,
    fromWire: (value) => value,
    wireToText: (value) => `blob "${bytesToCandidBlob(blobToBytes(value))}"`,
    textToWire: (parser) => {
      if (parser.consumeWord("blob")) {
        return parser.parseBlobLiteral()
      }
      parser.expectWord("vec")
      parser.expectChar("{")
      const bytes: number[] = []
      while (!parser.consumeChar("}")) {
        const value = parser.parseBigInt()
        parser.skipTypeAnnotation()
        assertByte(Number(value))
        bytes.push(Number(value))
        parser.consumeChar(";")
      }
      return new Uint8Array(bytes)
    },
    codecs: [],
  })
}

/**
 * Creates a schema for the unbounded Candid `nat` type.
 *
 * @returns Bigint schema for non-negative integers.
 */
export function nat(): BigIntSchema<"nat"> {
  return new BigIntSchema("nat")
}

/**
 * Creates a schema for the unbounded Candid `int` type.
 *
 * @returns Bigint schema for signed integers.
 */
export function int(): BigIntSchema<"int"> {
  return new BigIntSchema("int")
}

/**
 * Creates a schema for the Candid `nat8` type.
 *
 * @returns Number schema constrained to 0 through 255.
 */
export function nat8(): Schema<number, number> {
  return boundedNumber("nat8", 0, 255)
}

/**
 * Creates a schema for the Candid `nat16` type.
 *
 * @returns Number schema constrained to 0 through 65,535.
 */
export function nat16(): Schema<number, number> {
  return boundedNumber("nat16", 0, 65_535)
}

/**
 * Creates a schema for the Candid `nat32` type.
 *
 * @returns Number schema constrained to 0 through 4,294,967,295.
 */
export function nat32(): Schema<number, number> {
  return boundedNumber("nat32", 0, 4_294_967_295)
}

/**
 * Creates a schema for the Candid `nat64` type.
 *
 * @returns Bigint schema constrained to the unsigned 64-bit range.
 */
export function nat64(): Schema<bigint, bigint> {
  return boundedBigInt("nat64", 0n, 18_446_744_073_709_551_615n)
}

/**
 * Creates a schema for the Candid `int8` type.
 *
 * @returns Number schema constrained to the signed 8-bit range.
 */
export function int8(): Schema<number, number> {
  return boundedNumber("int8", -128, 127)
}

/**
 * Creates a schema for the Candid `int16` type.
 *
 * @returns Number schema constrained to the signed 16-bit range.
 */
export function int16(): Schema<number, number> {
  return boundedNumber("int16", -32_768, 32_767)
}

/**
 * Creates a schema for the Candid `int32` type.
 *
 * @returns Number schema constrained to the signed 32-bit range.
 */
export function int32(): Schema<number, number> {
  return boundedNumber("int32", -2_147_483_648, 2_147_483_647)
}

/**
 * Creates a schema for the Candid `int64` type.
 *
 * @returns Bigint schema constrained to the signed 64-bit range.
 */
export function int64(): Schema<bigint, bigint> {
  return boundedBigInt(
    "int64",
    -9_223_372_036_854_775_808n,
    9_223_372_036_854_775_807n
  )
}

/**
 * Creates a schema for the Candid `float32` type.
 *
 * @returns Number schema for 32-bit floating point values.
 */
export function float32(): Schema<number, number> {
  return float("float32")
}

/**
 * Creates a schema for the Candid `float64` type.
 *
 * @returns Number schema for 64-bit floating point values.
 */
export function float64(): Schema<number, number> {
  return float("float64")
}

/**
 * Builds the schema operations for an unbounded bigint-backed Candid integer.
 *
 * @param kind - Integer kind to represent.
 * @returns Schema operations for the requested integer kind.
 */
function bigIntOps(kind: "nat" | "int"): SchemaOps<bigint, bigint> {
  return {
    did: () => kind,
    toWire: (value) => {
      if (kind === "nat" && value < 0n) {
        throw new Error("nat cannot encode a negative value")
      }
      return value
    },
    fromWire: (value) => value,
    wireToText: (value) => `${value.toString()} : ${kind}`,
    textToWire: (parser) => {
      const value = parser.parseBigInt()
      parser.skipTypeAnnotation()
      if (kind === "nat" && value < 0n) {
        throw parser.error("nat cannot decode a negative value")
      }
      return value
    },
    codecs: [],
  }
}

/**
 * Creates a number schema that validates integer bounds on encode and parse.
 *
 * @param did - Candid type name to emit.
 * @param min - Inclusive minimum allowed value.
 * @param max - Inclusive maximum allowed value.
 * @returns Bounded number schema.
 */
function boundedNumber(
  did: string,
  min: number,
  max: number
): Schema<number, number> {
  return new Schema<number, number>({
    did: () => did,
    toWire: (value) => {
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${did} value out of range`)
      }
      return value
    },
    fromWire: (value) => value,
    wireToText: (value) => `${value.toString()} : ${did}`,
    textToWire: (parser) => {
      const value = Number(parser.parseBigInt())
      parser.skipTypeAnnotation()
      if (!Number.isInteger(value) || value < min || value > max) {
        throw parser.error(`${did} value out of range`)
      }
      return value
    },
    codecs: [],
  })
}

/**
 * Creates a bigint schema that validates integer bounds on encode and parse.
 *
 * @param did - Candid type name to emit.
 * @param min - Inclusive minimum allowed value.
 * @param max - Inclusive maximum allowed value.
 * @returns Bounded bigint schema.
 */
function boundedBigInt(
  did: string,
  min: bigint,
  max: bigint
): Schema<bigint, bigint> {
  return new Schema<bigint, bigint>({
    did: () => did,
    toWire: (value) => {
      if (value < min || value > max) {
        throw new Error(`${did} value out of range`)
      }
      return value
    },
    fromWire: (value) => value,
    wireToText: (value) => `${value.toString()} : ${did}`,
    textToWire: (parser) => {
      const value = parser.parseBigInt()
      parser.skipTypeAnnotation()
      if (value < min || value > max) {
        throw parser.error(`${did} value out of range`)
      }
      return value
    },
    codecs: [],
  })
}

/**
 * Creates a floating point schema.
 *
 * @param did - Candid float type name to emit.
 * @returns Number schema.
 */
function float(did: "float32" | "float64"): Schema<number, number> {
  return new Schema<number, number>({
    did: () => did,
    toWire: (value) => {
      if (typeof value !== "number") {
        throw new Error(`${did} value must be a number`)
      }
      return value
    },
    fromWire: (value) => value,
    wireToText: (value) =>
      `${Object.is(value, -0) ? "-0" : value.toString()} : ${did}`,
    textToWire: (parser) => {
      const value = parser.parseNumber()
      parser.skipTypeAnnotation()
      return value
    },
    codecs: [],
  })
}
