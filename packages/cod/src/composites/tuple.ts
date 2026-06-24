import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { InferTuple } from "./types"

/**
 * Candid `record { 0: A; 1: B; ... }` (positional) → `[A, B, ...]`
 */
export class CandidTupleCodec<
  E extends readonly CandidCodec<unknown>[],
> extends CandidCodec<InferTuple<E>> {
  readonly kind = "tuple" as const

  constructor(
    readonly elements: E,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferTuple<E>> {
    const idlTypes = this.elements.map((el) => el.toIDL())
    return IDL.Tuple(...idlTypes) as unknown as IDL.Type<InferTuple<E>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidTupleCodec(this.elements, metadata) as this
  }
}

/** Create a tuple codec from an array of element codecs. */
export function tuple<E extends readonly CandidCodec<unknown>[]>(
  elements: [...E]
): CandidTupleCodec<E> {
  return new CandidTupleCodec(elements)
}
