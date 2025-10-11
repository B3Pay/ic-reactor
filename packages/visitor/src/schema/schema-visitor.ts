/**
 * Zod Schema Visitor - Generate Zod Schemas from Candid IDL Types
 *
 * This module provides automatic generation of Zod validation schemas from Candid types
 * using the Visitor pattern. Unlike the codec-visitor which returns transformation functions,
 * this visitor returns the actual Zod schema objects.
 *
 * @example
 * import { idlToZodSchema } from "./schema-visitor"
 *
 * // Create a schema
 * const StatusSchema = idlToZodSchema(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null })
 * )
 *
 * // Use it for validation
 * const result = StatusSchema.safeParse({ Active: null })
 * if (result.success) {
 *   console.log(result.data) // Type-safe validated data
 * }
 */

import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import * as z from "zod"
import { ToDisplay } from "./display"

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA VISITOR TYPES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Direction of schema generation
 * - "candid": Generate schema for Candid format (backend)
 * - "display": Generate schema for Display format (frontend)
 */
export type SchemaDirection = "candid" | "display"

/**
 * Context data passed through the schema visitor during traversal.
 */
interface SchemaVisitorContext {
  /** Current depth in the type tree */
  depth: number
  /** Direction of schema generation */
  direction: SchemaDirection
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA VISITOR - Generates Zod schemas for all Candid types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Visitor implementation that generates Zod schemas from Candid IDL types.
 *
 * This visitor traverses the IDL type tree and generates appropriate Zod schemas
 * at each node based on the direction (candid or display format).
 *
 * **Schema Generation:**
 * - **candid**: Generate schemas for backend Candid format
 *   - bigint for Int/Nat
 *   - Principal objects
 *   - Optional as [] | [T]
 *   - Variants as { Key: value }
 *
 * - **display**: Generate schemas for frontend Display format
 *   - string for Int/Nat (bigint → string)
 *   - string for Principal (Principal → string)
 *   - Optional as T | undefined
 *   - Variants as { _type: "Key", Key?: value }
 *
 * **Supported Types:**
 * - Primitives: Bool, Null, Text, Int, Nat, Float, FixedInt, FixedNat, Principal
 * - Complex: Record, Variant, Tuple, Vec, Opt, Rec
 * - Special: Func (service method references), Service (service principals)
 */
export class SchemaVisitor extends IDL.Visitor<
  SchemaVisitorContext,
  z.ZodTypeAny
> {
  /**
   * Entry point for visiting any type.
   */
  visitType<T>(t: IDL.Type<T>, data: SchemaVisitorContext): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * Handle primitive types
   */
  visitPrimitive<T>(
    t: IDL.PrimitiveType<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * IDL.Empty - Never type (z.never())
   */
  visitEmpty(_t: IDL.EmptyClass, _data: SchemaVisitorContext): z.ZodTypeAny {
    return z.never()
  }

  /**
   * IDL.Bool - Boolean schema
   */
  visitBool(_t: IDL.BoolClass, _data: SchemaVisitorContext): z.ZodTypeAny {
    return z.boolean()
  }

  /**
   * IDL.Null - Null schema
   */
  visitNull(_t: IDL.NullClass, _data: SchemaVisitorContext): z.ZodTypeAny {
    return z.null()
  }

  /**
   * IDL.Reserved - Any schema (reserved type accepts anything)
   */
  visitReserved(
    _t: IDL.ReservedClass,
    _data: SchemaVisitorContext
  ): z.ZodTypeAny {
    return z.any()
  }

  /**
   * IDL.Text - String schema
   */
  visitText(_t: IDL.TextClass, _data: SchemaVisitorContext): z.ZodTypeAny {
    return z.string()
  }

  /**
   * IDL.Number - Delegates to specific number types
   */
  visitNumber<T>(
    t: IDL.PrimitiveType<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, data)
  }

  /**
   * IDL.Int - Bigint or String schema depending on direction
   */
  visitInt(_t: IDL.IntClass, data: SchemaVisitorContext): z.ZodTypeAny {
    if (data.direction === "display") {
      // Display format: string representation of bigint
      return z.string()
    } else {
      // Candid format: actual bigint
      return z.bigint()
    }
  }

  /**
   * IDL.Nat - Bigint or String schema depending on direction
   */
  visitNat(_t: IDL.NatClass, data: SchemaVisitorContext): z.ZodTypeAny {
    if (data.direction === "display") {
      return z.string()
    } else {
      return z.bigint()
    }
  }

  /**
   * IDL.Float - Number schema (float stays as number in both formats)
   */
  visitFloat(_t: IDL.FloatClass, _data: SchemaVisitorContext): z.ZodTypeAny {
    return z.number()
  }

  /**
   * IDL.FixedInt - Number or Bigint/String based on bit size
   */
  visitFixedInt(
    t: IDL.FixedIntClass,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    const bits = (t as any)._bits

    if (bits <= 32) {
      // 32-bit integers stay as numbers
      return z.number()
    } else {
      // 64-bit integers: bigint in Candid, string in Display
      if (data.direction === "display") {
        return z.string()
      } else {
        return z.bigint()
      }
    }
  }

  /**
   * IDL.FixedNat - Number or Bigint/String based on bit size
   */
  visitFixedNat(
    t: IDL.FixedNatClass,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    const bits = (t as any)._bits

    if (bits <= 32) {
      return z.number()
    } else {
      if (data.direction === "display") {
        return z.string()
      } else {
        return z.bigint()
      }
    }
  }

  /**
   * IDL.Principal - Principal or String schema depending on direction
   */
  visitPrincipal(
    _t: IDL.PrincipalClass,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    if (data.direction === "display") {
      // Display format: string representation
      return z.string()
    } else {
      // Candid format: Principal instance
      return z.custom<Principal>((val) => val instanceof Principal, {
        message: "Expected Principal instance",
      })
    }
  }

  /**
   * Handle construct types
   */
  visitConstruct<T>(
    t: IDL.ConstructType<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    return t.accept(this, { ...data, depth: data.depth + 1 })
  }

  /**
   * IDL.Vec - Array schema with element schema
   */
  visitVec<T>(
    _t: IDL.VecClass<T>,
    elemType: IDL.Type<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    // Special case: Vec<Nat8> is a Blob (Uint8Array in Candid, hex string in Display)
    const elemTypeName = (elemType as any).name || ""
    if (elemTypeName === "nat8") {
      if (data.direction === "display") {
        // Display: hex string or Uint8Array for large blobs
        return z.union([z.string(), z.instanceof(Uint8Array)])
      } else {
        // Candid: Uint8Array or number array
        return z.union([z.instanceof(Uint8Array), z.array(z.number())])
      }
    }

    // Regular array: array of element schema
    const elemSchema = elemType.accept(this, { ...data, depth: data.depth + 1 })
    return z.array(elemSchema)
  }

  /**
   * IDL.Opt - Optional schema ([] | [T] in Candid, T | undefined in Display)
   */
  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    const elemSchema = elemType.accept(this, { ...data, depth: data.depth + 1 })

    if (data.direction === "display") {
      // Display format: T | undefined
      return elemSchema.optional()
    } else {
      // Candid format: [] | [T]
      return z.union([z.tuple([]), z.tuple([elemSchema])])
    }
  }

  /**
   * IDL.Record - Object schema with field schemas
   */
  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    // Build schema for each field
    const fieldSchemas: Record<string, z.ZodTypeAny> = {}
    for (const [fieldName, fieldType] of fields) {
      fieldSchemas[fieldName] = fieldType.accept(this, {
        ...data,
        depth: data.depth + 1,
      })
    }

    return z.object(fieldSchemas)
  }

  /**
   * IDL.Tuple - Tuple schema
   */
  visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    const componentSchemas = components.map((component) =>
      component.accept(this, { ...data, depth: data.depth + 1 })
    ) as [z.ZodTypeAny, ...z.ZodTypeAny[]]

    // Zod requires at least one element for tuple, so check length
    if (componentSchemas.length === 0) {
      return z.tuple([])
    }

    return z.tuple(componentSchemas)
  }

  /**
   * IDL.Variant - Discriminated union schema
   *
   * **Candid format**: { Key: value } (one key present)
   * **Display format**: { _type: "Key", Key?: value } (discriminated union)
   */
  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    if (data.direction === "display") {
      // Display format: discriminated union with _type field
      const variantSchemas = fields.map(([variantName, variantType]) => {
        const valueSchema = variantType.accept(this, {
          ...data,
          depth: data.depth + 1,
        })

        // Check if this is a null variant (IDL.Null)
        const isNullVariant = (variantType as any).name === "null"

        if (isNullVariant) {
          // Null variant: { _type: "Key" }
          return z.object({
            _type: z.literal(variantName),
          })
        } else {
          // Value variant: { _type: "Key", Key: value }
          return z.object({
            _type: z.literal(variantName),
            [variantName]: valueSchema,
          })
        }
      })

      // Union of all variant schemas
      if (variantSchemas.length === 0) {
        return z.never()
      }

      if (variantSchemas.length === 1) {
        return variantSchemas[0]
      }

      return z.union([
        variantSchemas[0],
        variantSchemas[1],
        ...variantSchemas.slice(2),
      ])
    } else {
      // Candid format: { Key: value } where only one key is present
      const variantSchemas = fields.map(([variantName, variantType]) => {
        const valueSchema = variantType.accept(this, {
          ...data,
          depth: data.depth + 1,
        })
        return z.object({
          [variantName]: valueSchema,
        })
      })

      if (variantSchemas.length === 0) {
        return z.never()
      }

      if (variantSchemas.length === 1) {
        return variantSchemas[0]
      }

      return z.union([
        variantSchemas[0],
        variantSchemas[1],
        ...variantSchemas.slice(2),
      ])
    }
  }

  /**
   * IDL.Rec - Recursive type (use lazy schema)
   */
  visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: SchemaVisitorContext
  ): z.ZodTypeAny {
    // For recursive types, use z.lazy() to defer schema resolution
    return z.lazy(() => ty.accept(this, { ...data, depth: data.depth + 1 }))
  }

  /**
   * IDL.Func - Function reference schema
   *
   * In Candid, a Func is represented as a tuple [Principal, string]:
   * - [0]: The service Principal
   * - [1]: The method name
   *
   * **Candid format**: [Principal, string]
   * **Display format**: [string, string]
   */
  visitFunc(_t: IDL.FuncClass, data: SchemaVisitorContext): z.ZodTypeAny {
    if (data.direction === "display") {
      // Display format: [string, string]
      return z.tuple([z.string(), z.string()])
    } else {
      // Candid format: [Principal, string]
      const principalSchema = z.custom<Principal>(
        (val) => val instanceof Principal,
        {
          message: "Expected Principal instance",
        }
      )
      return z.tuple([principalSchema, z.string()])
    }
  }

  /**
   * IDL.Service - Service reference schema
   *
   * A Service is represented as a Principal in Candid, string in Display.
   */
  visitService(_t: IDL.ServiceClass, data: SchemaVisitorContext): z.ZodTypeAny {
    if (data.direction === "display") {
      return z.string()
    } else {
      return z.custom<Principal>((val) => val instanceof Principal, {
        message: "Expected Principal instance",
      })
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generate a Zod schema from an IDL type.
 *
 * @param idlType - The Candid IDL type definition
 * @param direction - "candid" for backend format, "display" for frontend format (default: "candid")
 * @returns A Zod schema that validates the specified format
 *
 * @example
 * // Generate schema for Candid format
 * type EscrowStatus = { Active: null } | { Completed: null } | { InDispute: null }
 *
 * const StatusSchemaCandid = idlToZodSchema(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null, InDispute: IDL.Null }),
 *   "candid"
 * )
 *
 * // Validate Candid format
 * const result = StatusSchemaCandid.safeParse({ Active: null })
 * // result.success === true
 *
 * @example
 * // Generate schema for Display format
 * type EscrowStatusDisplay = { _type: "Active" } | { _type: "Completed" } | { _type: "InDispute" }
 *
 * const StatusSchemaDisplay = idlToZodSchema(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null, InDispute: IDL.Null }),
 *   "display"
 * )
 *
 * // Validate Display format
 * const result = StatusSchemaDisplay.safeParse({ _type: "Active" })
 * // result.success === true
 *
 * @example
 * // Complex record with nested transformations
 * type Person = { name: string; age: bigint; email: [] | [string] }
 *
 * const PersonSchemaCandid = idlToZodSchema(
 *   IDL.Record({
 *     name: IDL.Text,
 *     age: IDL.Nat,
 *     email: IDL.Opt(IDL.Text)
 *   }),
 *   "candid"
 * )
 *
 * const validPerson = PersonSchemaCandid.safeParse({
 *   name: "Alice",
 *   age: 30n,
 *   email: ["alice@example.com"]
 * })
 * // validPerson.success === true
 *
 * @example
 * // Same schema in Display format
 * type PersonDisplay = { name: string; age: string; email?: string }
 *
 * const PersonSchemaDisplay = idlToZodSchema(
 *   IDL.Record({
 *     name: IDL.Text,
 *     age: IDL.Nat,
 *     email: IDL.Opt(IDL.Text)
 *   }),
 *   "display"
 * )
 *
 * const validPersonDisplay = PersonSchemaDisplay.safeParse({
 *   name: "Alice",
 *   age: "30",
 *   email: "alice@example.com"
 * })
 * // validPersonDisplay.success === true
 */
export function idlToZodSchema<TCandid = unknown>(
  idlType: IDL.Type,
  direction: "candid"
): z.ZodType<TCandid>
export function idlToZodSchema<TCandid = unknown>(
  idlType: IDL.Type,
  direction: "display"
): z.ZodType<ToDisplay<TCandid>>
export function idlToZodSchema(
  idlType: IDL.Type,
  direction: SchemaDirection = "candid"
): z.ZodTypeAny {
  const visitor = new SchemaVisitor()
  return visitor.visitType(idlType, { depth: 0, direction })
}

/**
 * Batch generate schemas for multiple IDL types.
 *
 * @param idlTypes - Object mapping names to IDL types
 * @param direction - "candid" for backend format, "display" for frontend format (default: "candid")
 * @returns Object mapping names to Zod schemas
 *
 * @example
 * const schemas = idlTypesToZodSchemas(
 *   {
 *     Status: IDL.Variant({ Active: IDL.Null, Completed: IDL.Null }),
 *     Person: IDL.Record({ name: IDL.Text, age: IDL.Nat })
 *   },
 *   "candid"
 * )
 *
 * // schemas.Status validates EscrowStatus in Candid format
 * // schemas.Person validates Person in Candid format
 */
export function idlTypesToZodSchemas<TTypes extends Record<string, IDL.Type>>(
  idlTypes: TTypes,
  direction: "candid"
): {
  [K in keyof TTypes]: TTypes[K] extends IDL.Type<infer TCandid>
    ? z.ZodType<TCandid>
    : never
}
export function idlTypesToZodSchemas<TTypes extends Record<string, IDL.Type>>(
  idlTypes: TTypes,
  direction: "display"
): {
  [K in keyof TTypes]: TTypes[K] extends IDL.Type<infer TCandid>
    ? ToDisplay<TCandid>
    : never
}
export function idlTypesToZodSchemas(
  idlTypes: Record<string, IDL.Type>,
  direction: SchemaDirection = "candid"
): Record<string, z.ZodTypeAny> {
  const result: Record<string, z.ZodTypeAny> = {}

  for (const [name, idlType] of Object.entries(idlTypes)) {
    result[name] = idlToZodSchema(idlType, direction as any)
  }

  return result
}

/**
 * Generate both Candid and Display schemas for an IDL type.
 *
 * @param idlType - The Candid IDL type definition
 * @returns Object with `candid` and `display` schemas
 *
 * @example
 * const { candid, display } = idlToZodSchemas(
 *   IDL.Variant({ Active: IDL.Null, Completed: IDL.Null })
 * )
 *
 * // Validate Candid format
 * candid.safeParse({ Active: null })
 *
 * // Validate Display format
 * display.safeParse({ _type: "Active" })
 */
export function idlToZodSchemas<TCandid = unknown>(
  idlType: IDL.Type
): {
  candid: z.ZodType<TCandid>
  display: z.ZodType<ToDisplay<TCandid>>
} {
  return {
    candid: idlToZodSchema(idlType, "candid"),
    display: idlToZodSchema(idlType, "display"),
  }
}
