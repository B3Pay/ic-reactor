import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "../codec"
import type { CandidMetadata } from "../types"
import type { Infer, InferOpt } from "./types"

/**
 * Candid `opt T` → `T | null`.
 * Nested options use `Some<T> | None` to preserve Candid's ambiguity.
 */
export class CandidOptCodec<C extends CandidCodec<unknown>> extends CandidCodec<
  InferOpt<C>
> {
  readonly kind = "opt" as const

  constructor(
    readonly inner: C,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferOpt<C>> {
    return IDL.Opt(this.inner.toIDL()) as unknown as IDL.Type<InferOpt<C>>
  }

  toCandid(value: InferOpt<C>): [] | [unknown] {
    if (isNestedOption(this.inner)) {
      if (isNone(value)) return []
      if (isSome(value)) return [this.inner.toCandid(value.value as Infer<C>)]
    }

    if (value === null || value === undefined) return []
    return [this.inner.toCandid(value as Infer<C>)]
  }

  fromCandid(value: unknown): InferOpt<C> {
    const values = Array.isArray(value) ? value : []
    if (values.length === 0) {
      return (
        isNestedOption(this.inner) ? { __kind__: "None" } : null
      ) as InferOpt<C>
    }

    const innerValue = this.inner.fromCandid(values[0])
    if (isNestedOption(this.inner)) {
      return { __kind__: "Some", value: innerValue } as InferOpt<C>
    }

    return innerValue as InferOpt<C>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidOptCodec(this.inner, metadata) as this
  }
}

/** Create an opt codec wrapping `inner`. */
export function opt<C extends CandidCodec<unknown>>(
  inner: C
): CandidOptCodec<C> {
  return new CandidOptCodec(inner)
}

function isNestedOption(
  codec: CandidCodec<unknown>
): codec is CandidCodec<unknown> & { readonly kind: "opt" } {
  return codec.kind === "opt"
}

function isSome(value: unknown): value is { __kind__: "Some"; value: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "__kind__" in value &&
    value.__kind__ === "Some"
  )
}

function isNone(value: unknown): value is { __kind__: "None" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "__kind__" in value &&
    value.__kind__ === "None"
  )
}
