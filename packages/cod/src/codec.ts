/**
 * Candid Codec — Base Class
 *
 * Immutable codec node. Every codec (primitive, composite, service) extends
 * this class. Metadata chaining methods return shallow clones so the
 * original is never mutated.
 */

import type { IDL } from "@icp-sdk/core/candid"
import type { CandidMetadata } from "./types"

/**
 * Base class for all Candid codecs.
 *
 * @typeParam T - The TypeScript type this codec represents at runtime.
 */
export abstract class CandidCodec<T> {
  /** Candid kind tag — e.g. "text", "record", "variant". */
  abstract readonly kind: string

  /** Metadata attached to this codec node. */
  readonly metadata: CandidMetadata

  constructor(metadata: CandidMetadata = {}) {
    this.metadata = Object.freeze({ ...metadata })
  }

  /** Produce the `@icp-sdk/core` IDL type for this codec. */
  abstract toIDL(): IDL.Type<T>

  /**
   * Convert an app-facing value into the raw JS shape expected by
   * `@icp-sdk/core` Candid encoders.
   */
  toCandid(value: T): unknown {
    return value
  }

  /**
   * Convert a raw JS value returned by `@icp-sdk/core` Candid decoders into
   * this codec's app-facing TypeScript shape.
   */
  fromCandid(value: unknown): T {
    return value as T
  }

  // ─── Metadata Chaining (Immutable) ──────────────────────────────────

  /** Return a new codec with the given description. */
  describe(text: string): this {
    return this._clone({ ...this.metadata, description: text })
  }

  /** Return a new codec with the given label. */
  label(text: string): this {
    return this._clone({ ...this.metadata, label: text })
  }

  /** Return a new codec with the given example value appended. */
  example(value: unknown): this {
    const examples = [...(this.metadata.examples ?? []), value]
    return this._clone({ ...this.metadata, examples })
  }

  /** Return a new codec with arbitrary metadata merged in. */
  meta(m: Partial<CandidMetadata>): this {
    return this._clone({ ...this.metadata, ...m })
  }

  // ─── Internal Clone ─────────────────────────────────────────────────

  /**
   * Create a shallow clone of this codec with updated metadata.
   * Subclasses override to copy their own fields.
   */
  protected abstract _clone(metadata: CandidMetadata): this
}
