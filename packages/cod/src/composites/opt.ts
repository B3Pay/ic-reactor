import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"

/**
 * Candid `opt T` → `[] | [T]`
 *
 * Follows the standard Candid opt encoding used by `@icp-sdk/core`.
 */
export class CandidOptCodec<T> extends CandidCodec<[] | [T]> {
  readonly kind = "opt" as const

  constructor(
    readonly inner: CandidCodec<T>,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<[] | [T]> {
    return IDL.Opt(this.inner.toIDL()) as IDL.Type<[] | [T]>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidOptCodec(this.inner, metadata) as this
  }
}

/** Create an opt codec wrapping `inner`. */
export function opt<T>(inner: CandidCodec<T>): CandidOptCodec<T> {
  return new CandidOptCodec(inner)
}
