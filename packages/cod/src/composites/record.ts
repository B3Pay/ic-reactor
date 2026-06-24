import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { InferRecord } from "./types"

/**
 * Candid `record { ... }` → `{ [K]: T }`
 */
export class CandidRecordCodec<
  F extends Record<string, CandidCodec<unknown>>,
> extends CandidCodec<InferRecord<F>> {
  readonly kind = "record" as const

  constructor(
    readonly fields: F,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferRecord<F>> {
    const idlFields: Record<string, IDL.Type> = {}
    for (const [key, codec] of Object.entries(this.fields)) {
      idlFields[key] = codec.toIDL()
    }
    return IDL.Record(idlFields) as unknown as IDL.Type<InferRecord<F>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidRecordCodec(this.fields, metadata) as this
  }
}

/** Create a record codec from a map of field codecs. */
export function record<F extends Record<string, CandidCodec<unknown>>>(
  fields: F
): CandidRecordCodec<F> {
  return new CandidRecordCodec(fields)
}
