/**
 * Zod Codec Visitor - Generate Bidirectional Zod Codecs from Candid IDL Types
 *
 * This module provides automatic generation of Zod codecs that support both
 * encoding (Display → Candid) and decoding (Candid → Display) in a single schema.
 * Uses Zod 4's `z.codec()` API for bidirectional transformations.
 *
 * @example
 * import { idlToZodCodec } from "./codec-schema-visitor"
 *
 * // Create a bidirectional codec
 * const StatusCodec = idlToZodCodec(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null })
 * )
 *
 * // Decode: Candid → Display
 * const display = StatusCodec.decode({ Active: null })
 * // => { _type: "Active" }
 *
 * // Encode: Display → Candid
 * const candid = StatusCodec.encode({ _type: "Active" })
 * // => { Active: null }
 */

import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import * as z from "zod"
import { extractVariant } from "../utils/candid"
import { hexToUint8Array, uint8ArrayToHex } from "../helpers/hash"
import { ToDisplay } from "./display"

// ═════════════════════════════════════════════════════════════════════════════
// CODEC VISITOR TYPES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Context data passed through the codec visitor during traversal.
 */
interface CodecVisitorContext {
  /** Current depth in the type tree */
  depth: number
}

// ═════════════════════════════════════════════════════════════════════════════
// CODEC VISITOR - Generates Zod codecs for all Candid types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Visitor implementation that generates bidirectional Zod codecs from Candid IDL types.
 *
 * This visitor traverses the IDL type tree and generates z.codec() instances that support:
 * - `.decode()`: Transform Candid format → Display format
 * - `.encode()`: Transform Display format → Candid format
 * - `.parse()`: Same as decode (for compatibility)
 *
 * **Supported Transformations:**
 * - **bigint** ↔ **string**: BigInt values converted to/from strings
 * - **Principal** ↔ **string**: Principal objects converted to/from text
 * - **[] | [T]** ↔ **T | undefined**: Candid optionals to JavaScript optionals
 * - **{ Key: value }** ↔ **{ _type: "Key", Key?: value }**: Variants to discriminated unions
 * - **Uint8Array** ↔ **hex string**: Binary data to/from hex representation
 */
export class CodecSchemaVisitor extends IDL.Visitor<
  CodecVisitorContext,
  z.ZodTypeAny
> {
  /**
   * Entry point for visiting any type.
   */
  visitType<T>(t: IDL.Type<T>, data: CodecVisitorContext): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * Handle primitive types
   */
  visitPrimitive<T>(
    t: IDL.PrimitiveType<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * IDL.Empty - Never type
   */
  visitEmpty(_t: IDL.EmptyClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.never()
  }

  /**
   * IDL.Bool - No transformation needed
   */
  visitBool(_t: IDL.BoolClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.boolean()
  }

  /**
   * IDL.Null - No transformation needed
   */
  visitNull(_t: IDL.NullClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.null()
  }

  /**
   * IDL.Reserved - Any type
   */
  visitReserved(
    _t: IDL.ReservedClass,
    _data: CodecVisitorContext
  ): z.ZodTypeAny {
    return z.any()
  }

  /**
   * IDL.Text - No transformation needed
   */
  visitText(_t: IDL.TextClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.string()
  }

  /**
   * IDL.Number - Delegates to specific number types
   */
  visitNumber<T>(
    t: IDL.PrimitiveType<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * IDL.Int - Bigint ↔ String codec
   */
  visitInt(_t: IDL.IntClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.codec(
      z.bigint(), // Candid format
      z.string(), // Display format
      {
        decode: (val) => (typeof val === "bigint" ? val.toString() : val),
        encode: (val) => (typeof val === "string" ? BigInt(val) : val),
      }
    )
  }

  /**
   * IDL.Nat - Bigint ↔ String codec
   */
  visitNat(_t: IDL.NatClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.codec(
      z.bigint(), // Candid format
      z.string(), // Display format
      {
        decode: (val) => (typeof val === "bigint" ? val.toString() : val),
        encode: (val) => (typeof val === "string" ? BigInt(val) : val),
      }
    )
  }

  /**
   * IDL.Float - No transformation needed
   */
  visitFloat(_t: IDL.FloatClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.number()
  }

  /**
   * IDL.FixedInt - Conditional codec based on bit size
   */
  visitFixedInt(
    t: IDL.FixedIntClass,
    _data: CodecVisitorContext
  ): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      // 32-bit integers stay as numbers
      return z.number()
    } else {
      // 64-bit integers: bigint ↔ string
      return z.codec(
        z.bigint(), // Candid format
        z.string(), // Display format
        {
          decode: (val) => (typeof val === "bigint" ? val.toString() : val),
          encode: (val) => (typeof val === "string" ? BigInt(val) : val),
        }
      )
    }
  }

  /**
   * IDL.FixedNat - Conditional codec based on bit size
   */
  visitFixedNat(
    t: IDL.FixedNatClass,
    _data: CodecVisitorContext
  ): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      return z.number()
    } else {
      return z.codec(
        z.bigint(), // Candid format
        z.string(), // Display format
        {
          decode: (val) => (typeof val === "bigint" ? val.toString() : val),
          encode: (val) => (typeof val === "string" ? BigInt(val) : val),
        }
      )
    }
  }

  /**
   * IDL.Principal - Principal ↔ String codec
   */
  visitPrincipal(
    _t: IDL.PrincipalClass,
    _data: CodecVisitorContext
  ): z.ZodTypeAny {
    return z.codec(
      z.custom<Principal>((val) => val instanceof Principal, {
        message: "Expected Principal instance",
      }),
      z.string(),
      {
        decode: (val) => (val instanceof Principal ? val.toText() : val),
        encode: (val) =>
          typeof val === "string" ? Principal.fromText(val) : val,
      }
    )
  }

  /**
   * Handle construct types
   */
  visitConstruct<T>(
    t: IDL.ConstructType<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, { ...data, depth: data.depth + 1 })
  }

  /**
   * IDL.Vec - Array codec with element codecs
   */
  visitVec<T>(
    _t: IDL.VecClass<T>,
    elemType: IDL.Type<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    // Special case: Vec<Nat8> is a Blob (Uint8Array ↔ hex string)
    const elemTypeName = elemType.name || ""
    if (elemTypeName === "nat8") {
      return z.codec(
        z.union([z.instanceof(Uint8Array), z.array(z.number())]),
        z.union([z.string(), z.instanceof(Uint8Array)]),
        {
          decode: (val: any) => {
            if (!val) return val
            if (val.length < 100) return uint8ArrayToHex(val, true)
            return val
          },
          encode: (val: any) => {
            if (typeof val !== "string") return val
            const hex = val.startsWith("0x") ? val.slice(2) : val
            return hexToUint8Array(hex)
          },
        }
      )
    }

    // Regular array: codec each element
    const elemCodec = elemType.accept(this, { ...data, depth: data.depth + 1 })

    // Extract input/output schemas from the nested codec
    const candidElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.in : elemCodec
    const displayElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.out : elemCodec

    return z.codec(z.array(candidElemSchema), z.array(displayElemSchema), {
      decode: (val) => val.map((elem) => elemCodec.decode(elem)),
      encode: (val) => val.map((elem) => elemCodec.encode(elem)),
    })
  }

  /**
   * IDL.Opt - Optional codec ([] | [T] ↔ T | undefined)
   */
  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    const elemCodec = elemType.accept(this, {
      ...data,
      depth: data.depth + 1,
    }) as any

    // Extract input/output schemas from the nested codec
    const candidElemSchema = elemCodec._def?.in || elemCodec
    const displayElemSchema = elemCodec._def?.out || elemCodec

    return z.codec(
      z.union([z.tuple([]), z.tuple([candidElemSchema])]),
      displayElemSchema.optional(),
      {
        decode: (val) => {
          if (!Array.isArray(val) || val.length === 0) return undefined
          return elemCodec.decode(val[0])
        },
        encode: (val) => {
          if (val === undefined || val === null) return [] as []
          return [elemCodec.encode(val)] as [any]
        },
      }
    )
  }

  /**
   * IDL.Record - Object codec with field codecs
   */
  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    // Build codecs and extract schemas in one pass
    const fieldCodecs: Record<string, z.ZodTypeAny> = {}
    const candidShape: Record<string, z.ZodTypeAny> = {}
    const displayShape: Record<string, z.ZodTypeAny> = {}

    for (const [fieldName, fieldType] of fields) {
      const codec = fieldType.accept(this, { ...data, depth: data.depth + 1 })
      const codecAny = codec as any
      fieldCodecs[fieldName] = codec
      candidShape[fieldName] = codecAny._def?.in || codec
      displayShape[fieldName] = codecAny._def?.out || codec
    }

    return z.codec(z.object(candidShape), z.object(displayShape), {
      decode: (val) =>
        Object.fromEntries(
          Object.entries(val).map(([key, value]) => [
            key,
            fieldCodecs[key].decode(value),
          ])
        ),
      encode: (val) =>
        Object.fromEntries(
          Object.entries(val).map(([key, value]) => [
            key,
            fieldCodecs[key].encode(value),
          ])
        ),
    })
  }

  /**
   * IDL.Tuple - Tuple codec
   */
  visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    const componentCodecs: any = components.map((component) =>
      component.accept(this, { ...data, depth: data.depth + 1 })
    )

    if (componentCodecs.length === 0) {
      return z.tuple([])
    }

    // Extract input/output schemas from nested codecs
    const candidComponents = componentCodecs.map(
      (codec: any) => codec._def?.in || codec
    )
    const displayComponents = componentCodecs.map(
      (codec: any) => codec._def?.out || codec
    )

    return z.codec(z.tuple(candidComponents), z.tuple(displayComponents), {
      decode: (val) =>
        val.map((elem: any, idx: number) => componentCodecs[idx].decode(elem)),
      encode: (val) =>
        val.map((elem: any, idx: number) => componentCodecs[idx].encode(elem)),
    })
  }

  /**
   * IDL.Variant - Variant codec ({ Key: value } ↔ { _type: "Key", Key?: value })
   */
  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    // Build codecs for variant values
    const variantCodecs: Record<string, z.ZodTypeAny> = {}
    for (const [variantName, variantType] of fields) {
      variantCodecs[variantName] = variantType.accept(this, {
        ...data,
        depth: data.depth + 1,
      })
    }

    // Extract input/output schemas from variant codecs
    const candidSchemas: Record<string, z.ZodTypeAny> = {}
    const displaySchemas: Record<string, z.ZodTypeAny> = {}
    for (const [variantName, codec] of Object.entries(variantCodecs)) {
      const codecAny = codec as any
      candidSchemas[variantName] = codecAny._def?.in || codec
      displaySchemas[variantName] = codecAny._def?.out || codec
    }

    // Build Candid variant schemas (union of { Key: value })
    const candidVariants = fields.map(([variantName, _variantType]) =>
      z.object({ [variantName]: candidSchemas[variantName] })
    )

    // Build Display variant schemas (union of { _type: "Key", Key?: value })
    const displayVariants = fields.map(([variantName, variantType]) => {
      const isNullVariant = variantType.name === "null"
      if (isNullVariant) {
        return z.object({ _type: z.literal(variantName) })
      } else {
        return z.object({
          _type: z.literal(variantName),
          [variantName]: displaySchemas[variantName],
        })
      }
    })

    const candidSchema =
      candidVariants.length === 1
        ? candidVariants[0]
        : z.union([
            candidVariants[0],
            candidVariants[1],
            ...candidVariants.slice(2),
          ])

    const displaySchema =
      displayVariants.length === 1
        ? displayVariants[0]
        : z.union([
            displayVariants[0],
            displayVariants[1],
            ...displayVariants.slice(2),
          ])

    return z.codec(candidSchema, displaySchema, {
      decode: (val: any) => {
        if (typeof val !== "object" || val === null || Array.isArray(val))
          return val

        const extracted = extractVariant(val)
        const key = extracted._type

        // Apply codec transformation if variant has a value
        if (
          key in extracted &&
          extracted[key] !== undefined &&
          key in variantCodecs
        ) {
          return {
            ...extracted,
            [key]: variantCodecs[key].decode(extracted[key]),
          }
        }

        return extracted
      },
      encode: (val: any) => {
        if (typeof val !== "object" || val === null || !("_type" in val))
          return val

        const key = val._type

        // Check if there's a value associated with this variant
        if (key in val && val[key] !== undefined && key in variantCodecs) {
          return { [key]: variantCodecs[key].encode(val[key]) }
        }

        // Null variant
        return { [key]: null }
      },
    })
  }

  /**
   * IDL.Rec - Recursive type (use lazy codec)
   */
  visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: CodecVisitorContext
  ): z.ZodTypeAny {
    // For recursive types, we create a lazy codec
    return z.lazy(() => ty.accept(this, { ...data, depth: data.depth + 1 }))
  }

  /**
   * IDL.Func - Function reference codec
   */
  visitFunc(_t: IDL.FuncClass, _data: CodecVisitorContext): z.ZodTypeAny {
    const principalSchema = z.custom<Principal>(
      (val) => val instanceof Principal,
      {
        message: "Expected Principal instance",
      }
    )

    return z.codec(
      z.tuple([principalSchema, z.string()]),
      z.tuple([z.string(), z.string()]),
      {
        decode: (val: any) => {
          if (!Array.isArray(val) || val.length !== 2) return val
          const [principal, method] = val
          return [
            principal instanceof Principal ? principal.toText() : principal,
            method,
          ]
        },
        encode: (val: any) => {
          if (!Array.isArray(val) || val.length !== 2) return val
          const [principalStr, method] = val
          return [
            typeof principalStr === "string"
              ? Principal.fromText(principalStr)
              : principalStr,
            method,
          ]
        },
      }
    )
  }

  /**
   * IDL.Service - Service reference codec
   */
  visitService(_t: IDL.ServiceClass, _data: CodecVisitorContext): z.ZodTypeAny {
    return z.codec(
      z.custom<Principal>((val) => val instanceof Principal, {
        message: "Expected Principal instance",
      }),
      z.string(),
      {
        decode: (val) => (val instanceof Principal ? val.toText() : val),
        encode: (val) =>
          typeof val === "string" ? Principal.fromText(val) : val,
      }
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Type representing a bidirectional Zod codec that transforms between
 * Candid format (TCandid) and Display format (ToDisplay<TCandid>).
 */
export type ToZodCodec<
  TCandid = unknown,
  TDisplay = ToDisplay<TCandid>
> = z.ZodCodec<z.ZodType<TCandid>, z.ZodType<TDisplay>>

/**
 * A unified codec interface that provides both Zod 4 native methods (decode/encode)
 * and backwards-compatible convenience methods (toDisplay/toCandid).
 *
 * @typeParam TCandid - The Candid (raw) type from the backend
 * @typeParam TDisplay - The Display (user-friendly) type for the frontend
 */
export interface ZodCodec<TCandid = unknown, TDisplay = ToDisplay<TCandid>> {
  /** Native Zod codec for direct use */
  codec: ToZodCodec<TCandid, TDisplay>
  /** Parse Candid value and convert to Display format (alias for codec.decode) */
  toDisplay: (val: TCandid) => TDisplay
  /** Parse Display value and convert to Candid format (alias for codec.encode) */
  toCandid: (val: TDisplay) => TCandid
}

/**
 * Generate a bidirectional Zod codec from an IDL type.
 *
 * The returned codec supports:
 * - `.decode(candid)`: Transform Candid format → Display format
 * - `.encode(display)`: Transform Display format → Candid format
 * - `.toDisplay(candid)`: Alias for decode (backwards compatibility)
 * - `.toCandid(display)`: Alias for encode (backwards compatibility)
 *
 * @param idlType - The Candid IDL type definition
 * @returns A bidirectional Zod codec with convenience methods
 *
 * @example
 * // Simple variant
 * const StatusCodec = idlToZodCodec(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null })
 * )
 * StatusCodec.decode({ Active: null }) // => { _type: "Active" }
 * StatusCodec.toDisplay({ Active: null }) // => { _type: "Active" } (same)
 * StatusCodec.encode({ _type: "Active" }) // => { Active: null }
 * StatusCodec.toCandid({ _type: "Active" }) // => { Active: null } (same)
 *
 * @example
 * // Complex record
 * const PersonCodec = idlToZodCodec(
 *   IDL.Record({
 *     name: IDL.Text,
 *     age: IDL.Nat,
 *     email: IDL.Opt(IDL.Text)
 *   })
 * )
 * PersonCodec.decode({ name: "Alice", age: 30n, email: ["alice@example.com"] })
 * // => { name: "Alice", age: "30", email: "alice@example.com" }
 */
export function idlToZodCodec<TCandid = unknown, TDisplay = ToDisplay<TCandid>>(
  idlType: IDL.Type
): ZodCodec<TCandid, TDisplay> {
  const visitor = new CodecSchemaVisitor()
  const codec = visitor.visitType(idlType, { depth: 0 }) as ToZodCodec<
    TCandid,
    TDisplay
  >
  // Return a unified interface with both native methods and convenience aliases
  return {
    codec,
    toDisplay: (val: TCandid) => codec.decode(val) as TDisplay,
    toCandid: (val: TDisplay) => codec.encode(val) as TCandid,
  }
}

/**
 * Batch generate codecs for multiple IDL types.
 *
 * @param idlTypes - Object mapping names to IDL types
 * @returns Object mapping names to codecs with convenience methods
 *
 * @example
 * const codecs = idlTypesToZodCodecs({
 *   Status: IDL.Variant({ Active: IDL.Null, Completed: IDL.Null }),
 *   Person: IDL.Record({ name: IDL.Text, age: IDL.Nat })
 * })
 * codecs.Status.decode({ Active: null }) // => { _type: "Active" }
 * codecs.Status.toDisplay({ Active: null }) // => { _type: "Active" } (same)
 * codecs.Status.encode({ _type: "Active" }) // => { Active: null }
 * codecs.Status.toCandid({ _type: "Active" }) // => { Active: null } (same)
 */
export function idlTypesToZodCodecs<TTypes extends Record<string, IDL.Type>>(
  idlTypes: TTypes
): {
  [K in keyof TTypes]: TTypes[K] extends IDL.Type<infer TCandid>
    ? ZodCodec<TCandid>
    : never
} {
  const result = {} as any

  for (const [name, idlType] of Object.entries(idlTypes)) {
    result[name] = idlToZodCodec(idlType)
  }

  return result
}
