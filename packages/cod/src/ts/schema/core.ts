import { CandidTextParser } from "./candid-text.js"

/**
 * Nominal marker type used to distinguish otherwise identical app-level values.
 *
 * @typeParam Base - The structural value type being branded.
 * @typeParam Name - The stable brand name attached to the value.
 */
export type Brand<Base, Name extends string> = Base & { readonly __brand: Name }

/**
 * Bidirectional app-level transform for a schema while preserving the wire type.
 *
 * @typeParam WireType - The value shape accepted by the Candid wire encoder.
 * @typeParam AppType - The value shape exposed to application code.
 */
export interface Codec<WireType, AppType> {
  /** Human-readable codec name used for schema metadata and debugging. */
  name: string

  /**
   * Converts an app-level value into the schema's wire-level value.
   *
   * @param value - App-level value to encode.
   * @returns Wire-level value passed to the Candid text/wire encoder.
   */
  encode(value: AppType): WireType

  /**
   * Converts a wire-level value into the schema's app-level value.
   *
   * @param value - Wire-level value decoded from Candid.
   * @returns App-level value exposed to callers.
   */
  decode(value: WireType): AppType
}

/**
 * Small metadata bag attached to schemas by runtime builders.
 */
export type SchemaMetadata = {
  readonly docs?: string
  readonly name?: string
  readonly candidType?: string
  readonly [key: string]: unknown
}

/**
 * Low-level behavior supplied by each concrete schema implementation.
 *
 * @typeParam WireType - The value shape represented in Candid text and bytes.
 * @typeParam AppType - The value shape accepted and returned by application APIs.
 */
export interface SchemaOps<WireType, AppType> {
  /**
   * Returns the Candid type expression for this schema's wire type.
   *
   * @returns Candid type text.
   */
  did(): string

  /**
   * Converts an app-level value into its wire-level value.
   *
   * @param value - App-level value.
   * @returns Wire-level value.
   */
  toWire(value: AppType): WireType

  /**
   * Converts a wire-level value into its app-level value.
   *
   * @param value - Wire-level value.
   * @returns App-level value.
   */
  fromWire(value: WireType): AppType

  /**
   * Renders a wire-level value as Candid text.
   *
   * @param value - Wire-level value to render.
   * @returns Candid text representation.
   */
  wireToText(value: WireType): string

  /**
   * Parses a wire-level value from Candid text.
   *
   * @param parser - Parser positioned at the value.
   * @returns Parsed wire-level value.
   */
  textToWire(parser: CandidTextParser): WireType

  /** Ordered names of codecs already applied to this schema. */
  codecs: readonly string[]
}

/**
 * Zod-style runtime schema for a Candid value.
 *
 * A schema tracks both the Candid wire type and the app-facing type. Plain
 * schemas use the same type for both; codecs can project the app-facing type
 * without changing the wire type or generated DID.
 *
 * @typeParam WireType - The value shape encoded in Candid.
 * @typeParam AppType - The value shape used by application code.
 */
export class Schema<WireType, AppType = WireType> {
  /** Concrete operations used to implement this schema. */
  protected readonly ops: SchemaOps<WireType, AppType>

  #metadata: SchemaMetadata

  /**
   * Creates a schema from concrete operations.
   *
   * @param ops - Low-level schema behavior.
   * @param metadata - Optional runtime metadata.
   */
  constructor(
    ops: SchemaOps<WireType, AppType>,
    metadata: SchemaMetadata = {}
  ) {
    this.ops = ops
    this.#metadata = metadata
  }

  /**
   * Returns the Candid type expression for the schema's wire type.
   *
   * @returns Candid type text.
   */
  wireDid(): string {
    return this.ops.did()
  }

  /**
   * Converts an app-level value into a wire-level value.
   *
   * @param value - App-level value.
   * @returns Wire-level value.
   */
  toWire(value: AppType): WireType {
    return this.ops.toWire(value)
  }

  /**
   * Converts a wire-level value into an app-level value.
   *
   * @param value - Wire-level value.
   * @returns App-level value.
   */
  fromWire(value: WireType): AppType {
    return this.ops.fromWire(value)
  }

  /**
   * Converts an app-level value directly into Candid text.
   *
   * @param value - App-level value to render.
   * @returns Candid text representation.
   */
  toCandid(value: AppType): string {
    return this.wireToCandid(this.toWire(value))
  }

  /**
   * Parses an app-level value from Candid text.
   *
   * @param text - Candid text containing exactly one value for this schema.
   * @returns Decoded app-level value.
   * @throws If the text cannot be parsed as this schema's wire type.
   */
  fromCandid(text: string): AppType {
    const parser = new CandidTextParser(text)
    const wire = this.parseWire(parser)
    parser.expectEnd()
    return this.fromWire(wire)
  }

  /**
   * Converts a wire-level value into Candid text.
   *
   * @param value - Wire-level value to render.
   * @returns Candid text representation.
   */
  wireToCandid(value: WireType): string {
    return this.ops.wireToText(value)
  }

  /**
   * Applies an app-level codec without changing this schema's Candid wire type.
   *
   * @typeParam NextAppType - New app-facing value type after the codec.
   * @param codec - Bidirectional transform between wire and app values.
   * @returns New schema with the same wire type and transformed app type.
   */
  codec<NextAppType>(
    codec: Codec<WireType, NextAppType>
  ): Schema<WireType, NextAppType> {
    const codecs = [...this.ops.codecs, codec.name]
    return new Schema<WireType, NextAppType>(
      {
        did: this.ops.did,
        toWire: codec.encode,
        fromWire: codec.decode,
        wireToText: this.ops.wireToText,
        textToWire: this.ops.textToWire,
        codecs,
      },
      this.#metadata
    )
  }

  /**
   * Adds a human-readable description to this schema.
   *
   * @param text - Documentation text.
   * @returns This schema for chaining.
   */
  describe(text: string): this {
    return this.meta({ docs: text })
  }

  /**
   * Adds or updates runtime metadata on this schema.
   *
   * @param metadata - Metadata values to merge.
   * @returns This schema for chaining.
   */
  meta(metadata: SchemaMetadata): this {
    this.#metadata = { ...this.#metadata, ...metadata }
    return this
  }

  /**
   * Returns metadata attached to this schema.
   *
   * @returns Schema metadata.
   */
  metadata(): Readonly<SchemaMetadata> {
    return this.#metadata
  }

  /**
   * Applies a nominal TypeScript brand to this schema's app-level value.
   *
   * @typeParam Name - Brand name to attach to the app-level value.
   * @returns New schema with the same runtime behavior and branded app type.
   */
  brand<Name extends string>(): Schema<WireType, Brand<AppType, Name>> {
    return this.codec<Brand<AppType, Name>>({
      name: "brand",
      encode: (value) => this.toWire(value as AppType),
      decode: (value) => this.fromWire(value) as Brand<AppType, Name>,
    })
  }

  /**
   * Parses this schema's wire-level value from a shared Candid text parser.
   *
   * @param parser - Parser positioned at either a bare value or parenthesized value.
   * @returns Parsed wire-level value.
   * @throws If the parser input does not match this schema.
   */
  parseWire(parser: CandidTextParser): WireType {
    if (parser.consumeChar("(")) {
      const value = this.ops.textToWire(parser)
      parser.expectChar(")")
      return value
    }
    return this.ops.textToWire(parser)
  }
}

/**
 * Any schema regardless of its wire or app value types.
 */
export type AnySchema = Schema<any, any>

/**
 * Extracts the app-level TypeScript type from a schema.
 *
 * @typeParam T - Schema to inspect.
 */
export type Infer<T extends AnySchema> =
  T extends Schema<any, infer AppType> ? AppType : never

/**
 * Extracts the wire-level TypeScript type from a schema.
 *
 * @typeParam T - Schema to inspect.
 */
export type InferWire<T extends AnySchema> =
  T extends Schema<infer WireType, any> ? WireType : never

/**
 * Creates a schema placeholder for Candid value kinds whose codecs are not
 * implemented by the lightweight TypeScript runtime yet.
 *
 * The placeholder still renders the original Candid type in generated service
 * schemas, but throws if encoding, decoding, or text conversion is attempted.
 *
 * @typeParam AppType - App-facing type to expose through {@link Infer}.
 * @param candidType - Candid type text preserved in generated schemas.
 * @param reason - Optional custom failure reason.
 * @returns Unsupported schema placeholder.
 */
export function unsupported<AppType = unknown>(
  candidType: string,
  reason = `Candid ${candidType} values are not supported by this schema codec yet`
): Schema<unknown, AppType> {
  return new Schema<unknown, AppType>({
    did: () => candidType,
    toWire: () => {
      throw new Error(reason)
    },
    fromWire: () => {
      throw new Error(reason)
    },
    wireToText: () => {
      throw new Error(reason)
    },
    textToWire: () => {
      throw new Error(reason)
    },
    codecs: [],
  })
}

/**
 * Schema that resolves its implementation on first use.
 */
export class LazySchema extends Schema<any, any> {
  /**
   * Creates a lazy schema.
   *
   * @param thunk - Resolver returning the concrete schema.
   * @param didFallback - Optional DID text used when a recursive DID render re-enters this schema.
   */
  constructor(thunk: () => AnySchema, didFallback?: string) {
    let resolved: AnySchema | undefined
    let resolvingDid = false
    const schema = () => {
      resolved ??= thunk()
      return resolved
    }
    super({
      did: () => {
        if (resolvingDid) {
          if (didFallback) {
            return didFallback
          }
          throw new Error(
            "recursive lazy schema DID rendering requires a fallback type name"
          )
        }
        resolvingDid = true
        try {
          return schema().wireDid()
        } finally {
          resolvingDid = false
        }
      },
      toWire: (value) => schema().toWire(value),
      fromWire: (value) => schema().fromWire(value),
      wireToText: (value) => schema().wireToCandid(value),
      textToWire: (parser) => schema().parseWire(parser),
      codecs: [],
    })
  }
}

/**
 * Creates a schema that resolves its concrete implementation on first use.
 *
 * @param thunk - Resolver returning the concrete schema.
 * @param didFallback - Optional DID text used when rendering recursive schemas.
 * @returns Lazy schema wrapper.
 */
export function lazy<const SchemaType extends AnySchema>(
  thunk: () => SchemaType,
  didFallback?: string
): SchemaType {
  return new LazySchema(thunk, didFallback) as SchemaType
}
