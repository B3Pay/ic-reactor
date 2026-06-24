import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { InferVariant } from "./types"

/**
 * Candid variants infer to bindgen-compatible TypeScript shapes:
 * - all-null variants infer to a string-literal enum shape
 * - payload variants infer to a `__kind__` discriminated union
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

  toCandid(value: InferVariant<F>): Record<string, unknown> {
    const fields = this.fields as Record<string, CandidCodec<unknown>>
    const key = extractVariantKey(value, fields)
    const codec = fields[key]
    if (!codec) {
      throw new Error(`Unknown variant arm: ${key}`)
    }

    if (typeof value === "string") {
      return { [key]: null }
    }

    const payload = (value as Record<string, unknown>)[key]
    return { [key]: codec.toCandid(payload as never) }
  }

  fromCandid(value: unknown): InferVariant<F> {
    const source =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {}
    const fields = this.fields as Record<string, CandidCodec<unknown>>
    const key = Object.keys(source).find((candidate) => candidate in fields)
    if (!key) {
      throw new Error("Unable to decode Candid variant: no matching arm")
    }

    const codec = fields[key]
    if (!hasPayloadArms(fields)) {
      return key as InferVariant<F>
    }

    return {
      __kind__: key,
      [key]: codec.fromCandid(source[key]),
    } as InferVariant<F>
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

function extractVariantKey(
  value: unknown,
  fields: Record<string, CandidCodec<unknown>>
): string {
  if (typeof value === "string") return value

  if (typeof value !== "object" || value === null) {
    throw new Error("Unable to encode Candid variant: expected an object")
  }

  if ("__kind__" in value && typeof value.__kind__ === "string") {
    return value.__kind__
  }

  const key = Object.keys(value).find((candidate) => candidate in fields)
  if (key) return key

  throw new Error("Unable to encode Candid variant: no matching arm")
}

function hasPayloadArms(fields: Record<string, CandidCodec<unknown>>): boolean {
  return Object.values(fields).some((codec) => codec.kind !== "null")
}
