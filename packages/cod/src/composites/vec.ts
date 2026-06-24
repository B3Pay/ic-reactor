import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { Infer } from "./types"

/**
 * Candid `vec T` → `T[]`
 */
export class CandidVecCodec<C extends CandidCodec<unknown>> extends CandidCodec<
  Infer<C>[]
> {
  readonly kind = "vec" as const

  constructor(
    readonly inner: C,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<Infer<C>[]> {
    return IDL.Vec(this.inner.toIDL()) as unknown as IDL.Type<Infer<C>[]>
  }

  toCandid(value: Infer<C>[]): unknown[] {
    return value.map((item) => this.inner.toCandid(item))
  }

  fromCandid(value: unknown): Infer<C>[] {
    if (!Array.isArray(value)) return []
    return value.map((item) => this.inner.fromCandid(item)) as Infer<C>[]
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidVecCodec(this.inner, metadata) as this
  }
}

/** Create a vec codec wrapping `inner`. */
export function vec<C extends CandidCodec<unknown>>(
  inner: C
): CandidVecCodec<C> {
  return new CandidVecCodec(inner)
}
