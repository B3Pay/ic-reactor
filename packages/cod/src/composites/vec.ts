import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"

/**
 * Candid `vec T` → `T[]`
 */
export class CandidVecCodec<T> extends CandidCodec<T[]> {
  readonly kind = "vec" as const

  constructor(
    readonly inner: CandidCodec<T>,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<T[]> {
    return IDL.Vec(this.inner.toIDL()) as IDL.Type<T[]>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidVecCodec(this.inner, metadata) as this
  }
}

/** Create a vec codec wrapping `inner`. */
export function vec<T>(inner: CandidCodec<T>): CandidVecCodec<T> {
  return new CandidVecCodec(inner)
}
