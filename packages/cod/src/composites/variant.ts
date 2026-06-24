import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { InferVariant } from "./types"

/**
 * Candid `variant { ... }` → discriminated union `{ Ok: T } | { Err: E }`
 */
export class CandidVariantCodec<
  F extends Record<string, CandidCodec<unknown>>,
> extends CandidCodec<InferVariant<F>> {
  readonly kind = "variant" as const

  constructor(
    readonly fields: F,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferVariant<F>> {
    const idlFields: Record<string, IDL.Type> = {}
    for (const [key, codec] of Object.entries(this.fields)) {
      idlFields[key] = codec.toIDL()
    }
    return IDL.Variant(idlFields) as unknown as IDL.Type<InferVariant<F>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidVariantCodec(this.fields, metadata) as this
  }
}

/** Create a variant codec from a map of arm codecs. */
export function variant<F extends Record<string, CandidCodec<unknown>>>(
  fields: F
): CandidVariantCodec<F> {
  return new CandidVariantCodec(fields)
}
