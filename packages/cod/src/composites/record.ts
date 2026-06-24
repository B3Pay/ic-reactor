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

  toCandid(value: InferRecord<F>): Record<string, unknown> {
    const source = value as Record<string, unknown>
    const candid: Record<string, unknown> = {}

    for (const [key, codec] of Object.entries(this.fields)) {
      if (isOptCodec(codec)) {
        if (!hasOwn(source, key) || source[key] === undefined) {
          candid[key] = []
        } else {
          candid[key] = [codec.inner.toCandid(source[key] as never)]
        }
        continue
      }

      candid[key] = codec.toCandid(source[key] as never)
    }

    return candid
  }

  fromCandid(value: unknown): InferRecord<F> {
    const source =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {}
    const record: Record<string, unknown> = {}

    for (const [key, codec] of Object.entries(this.fields)) {
      const candidValue = source[key]
      if (isOptCodec(codec)) {
        const values = Array.isArray(candidValue) ? candidValue : []
        if (values.length > 0) {
          record[key] = codec.inner.fromCandid(values[0])
        }
        continue
      }

      record[key] = codec.fromCandid(candidValue)
    }

    return record as InferRecord<F>
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

function isOptCodec(
  codec: CandidCodec<unknown>
): codec is CandidCodec<unknown> & {
  readonly kind: "opt"
  readonly inner: CandidCodec<unknown>
} {
  return codec.kind === "opt" && "inner" in codec
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}
