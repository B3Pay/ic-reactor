/**
 * Candid Codec — Primitive Factories
 *
 * One factory per Candid primitive type. Each returns a concrete
 * `CandidCodec<T>` whose `toIDL()` delegates to the matching `IDL.*`.
 */

import { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { CandidCodec } from "./codec"
import type { CandidMetadata } from "./types"

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
