import {
  ActorMethodParameters,
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
} from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import * as z from "zod"
import { isQuery } from "../helpers"

export * from "./types"

/**
 * Visitor implementation that converts Candid IDL types to Zod schemas.
 *
 * The Visitor pattern allows us to traverse the IDL type tree and build
 * corresponding Zod schemas at each node.
 */
export class IDLToZodVisitor extends IDL.Visitor<string, z.ZodTypeAny> {
  public recursiveTypes: Map<string, z.ZodTypeAny> = new Map()

  /**
   * Entry point for visiting any type.
   * This method dispatches to the appropriate specific visitor method.
   */
  visitType<T>(t: IDL.Type<T>, label: string): z.ZodTypeAny {
    return t.accept(this, label)
  }

  /**
   * Handle primitive types by delegating to specific methods
   */
  visitPrimitive<T>(t: IDL.PrimitiveType<T>, label: string): z.ZodTypeAny {
    return t.accept(this, label)
  }

  /**
   * IDL.Empty - A type with no inhabitants
   * Maps to z.never() since it can never be instantiated
   */
  visitEmpty(_t: IDL.EmptyClass, _label: string): z.ZodTypeAny {
    return z.never()
  }

  /**
   * IDL.Bool - Boolean type
   * Maps to z.boolean()
   */
  visitBool(
    _t: IDL.BoolClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.boolean()
  }

  /**
   * IDL.Null - Null type
   * Maps to z.null()
   */
  visitNull(
    _t: IDL.NullClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.null()
  }

  /**
   * IDL.Reserved - Reserved type (accepts any value)
   * Maps to z.any()
   */
  visitReserved(
    _t: IDL.ReservedClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.any()
  }

  /**
   * IDL.Text - String type
   * Maps to z.string()
   */
  visitText(
    _t: IDL.TextClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.string()
  }

  /**
   * IDL.Number - Generic number type
   * Most number types delegate to specific methods
   */
  visitNumber<T>(t: IDL.PrimitiveType<T>, label: string): z.ZodTypeAny {
    return t.accept(this, label)
  }

  /**
   * IDL.Int - Arbitrary precision integer
   * Maps to z.bigint()
   */
  visitInt(
    _t: IDL.IntClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.bigint()
  }

  /**
   * IDL.Nat - Natural number (non-negative arbitrary precision)
   * Maps to z.bigint() with non-negative refinement
   */
  visitNat(
    _t: IDL.NatClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.bigint().nonnegative()
  }

  /**
   * IDL.Float32 or IDL.Float64 - Floating point numbers
   * Maps to z.number()
   */
  visitFloat(
    _t: IDL.FloatClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.number()
  }

  /**
   * IDL.Int8, IDL.Int16, IDL.Int32, IDL.Int64 - Fixed-size integers
   * Maps to z.number() for 32-bit, z.bigint() for 64-bit
   */
  visitFixedInt(
    t: IDL.FixedIntClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    // Check the bit size from the type
    const bits = t._bits

    if (bits <= 32) {
      // JavaScript numbers can safely represent 32-bit integers
      return z.number().int()
    } else {
      // Use bigint for 64-bit integers
      return z.bigint()
    }
  }

  /**
   * IDL.Nat8, IDL.Nat16, IDL.Nat32, IDL.Nat64 - Fixed-size natural numbers
   * Maps to z.number() for 32-bit, z.bigint() for 64-bit, both non-negative
   */
  visitFixedNat(
    t: IDL.FixedNatClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const bits = t._bits

    if (bits <= 32) {
      return z.number().int().nonnegative()
    } else {
      return z.bigint().nonnegative()
    }
  }

  /**
   * IDL.Principal - Internet Computer Principal
   * Maps to our custom z.principal() (or z.custom<Principal>)
   */
  visitPrincipal(
    _t: IDL.PrincipalClass,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    return z.custom<Principal>(
      (val): val is Principal => val instanceof Principal,
      {
        message: "Expected a Principal instance",
      }
    )
  }

  /**
   * Handle construct types (Vec, Opt, Record, Variant, etc.)
   */
  visitConstruct<T>(t: IDL.ConstructType<T>, label: string): z.ZodTypeAny {
    return t.accept(this, label)
  }

  /**
   * IDL.Vec(T) - Vector/Array type
   * Maps to z.array(zodType)
   */
  visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const innerSchema = ty.accept(this, label) as z.ZodTypeAny
    return z.array(innerSchema)
  }

  /**
   * IDL.Opt(T) - Optional type
   * Maps to z.optional(zodType) or zodType.nullish()
   */
  visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const innerSchema = ty.accept(this, label) as z.ZodTypeAny
    return innerSchema.nullish()
  }

  /**
   * IDL.Record({ field1: Type1, field2: Type2, ... }) - Record/Object type
   * Maps to z.object({ field1: zodType1, field2: zodType2, ... })
   */
  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const shape: Record<string, z.ZodTypeAny> = {}

    for (const [fieldName, fieldType] of fields) {
      shape[fieldName] = fieldType.accept(this, fieldName) as z.ZodTypeAny
    }

    return z.object(shape)
  }

  /**
   * IDL.Tuple([T1, T2, ...]) - Tuple type
   * Maps to z.tuple([zodType1, zodType2, ...])
   */
  visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const schemas = components.map((component, idx) =>
      component.accept(this, `[${idx}]`)
    ) as z.ZodTypeAny[]

    return z.tuple(schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]])
  }

  /**
   * IDL.Variant({ tag1: Type1, tag2: Type2, ... }) - Variant/Union type
   * Maps to z.discriminatedUnion or z.union
   *
   * For discriminated unions with consistent structure, we use z.discriminatedUnion
   * Otherwise, we fall back to z.union
   */

  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const variants: z.ZodTypeAny[] = []

    for (const [variantName, variantType] of fields) {
      if (variantType.name === "Null") {
        // Null variant: { TagName: null }
        variants.push(
          z.object({
            [variantName]: z.null(),
          })
        )
      } else {
        // Non-null variant: { TagName: Type }
        const innerSchema = variantType.accept(
          this,
          variantName
        ) as z.ZodTypeAny

        variants.push(
          z.object({
            [variantName]: innerSchema,
          })
        )
      }
    }

    return z.union(variants as [z.ZodTypeAny, ...z.ZodTypeAny[]])
  }

  /**
   * IDL.Rec(T) - Recursive type
   * Handles self-referential types using z.lazy()
   */
  visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    _label: string
  ): z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>> {
    const typeName = ty.name || "RecursiveType"

    // Check if we've already started processing this recursive type
    if (this.recursiveTypes.has(typeName)) {
      return this.recursiveTypes.get(typeName)!
    }

    // Create a lazy schema that will be resolved later
    const lazySchema = z.lazy(() => {
      return ty.accept(this, typeName) as z.ZodTypeAny
    })

    // Store it for future references
    this.recursiveTypes.set(typeName, lazySchema)

    return lazySchema
  }

  /**
   * IDL.Func - Function type
   * Maps to z.tuple([z.custom<Principal>, z.string()])
   */
  visitFunc(_t: IDL.FuncClass, _label: string): z.ZodTypeAny {
    return z.tuple([
      z.custom<Principal>((val) => val instanceof Principal),
      z.string(),
    ])
  }

  /**
   * IDL.Service - Service type
   * Maps to z.custom<Principal>
   */
  visitService(_t: IDL.ServiceClass, _label: string): z.ZodTypeAny {
    return z.custom<Principal>((val) => val instanceof Principal)
  }
}

/**
 * Convenience function to convert an IDL type to a Zod schema with full TypeScript type inference.
 *
 * @typeParam T - The TypeScript type that matches the IDL structure (optional but recommended)
 * @param idlType - The Candid IDL type to convert
 * @returns A fully typed Zod schema that validates values of type T
 *
 * @example
 * // Without explicit type (returns z.ZodType<any>)
 * const PersonType = IDL.Record({
 *   name: IDL.Text,
 *   age: IDL.Nat,
 *   email: IDL.Opt(IDL.Text)
 * })
 * const PersonSchema = idlToZod(PersonType)
 *
 * @example
 * // With explicit type (returns z.ZodType<Person>)
 * type Person = {
 *   name: string
 *   age: bigint
 *   email?: string
 * }
 * const PersonSchema = idlToZod<Person>(PersonType)
 * // Now PersonSchema.parse() returns Person type
 * const person = PersonSchema.parse(data) // person: Person
 *
 * @example
 * // With variant types
 * type EscrowStatus =
 *   | { Active: null }
 *   | { Completed: null }
 *   | { InDispute: null }
 *
 * const StatusSchema = idlToZod<EscrowStatus>(IDL.Variant({
 *   Active: IDL.Null,
 *   Completed: IDL.Null,
 *   InDispute: IDL.Null
 * }))
 * // StatusSchema validates and returns EscrowStatus type
 */
export function idlToZod<T = any>(idlType: IDL.Type<any>): z.ZodType<T> {
  const visitor = new IDLToZodVisitor()
  return visitor.visitType(idlType, "") as z.ZodType<T>
}

/**
 * Convert multiple IDL types to Zod schemas at once with full TypeScript type inference.
 * Useful for converting all types from a service definition.
 *
 * @typeParam TTypes - Object mapping type names to their TypeScript types (optional)
 * @param idlTypes - Object mapping names to IDL types
 * @returns Object mapping the same names to fully typed Zod schemas
 *
 * @example
 * // Without explicit types
 * const types = {
 *   Person: IDL.Record({ name: IDL.Text, age: IDL.Nat }),
 *   Status: IDL.Variant({ Active: IDL.Null, Inactive: IDL.Null })
 * }
 * const schemas = idlTypesToZod(types)
 *
 * @example
 * // With explicit types for full type inference
 * type Person = { name: string; age: bigint }
 * type Status = { Active: null } | { Inactive: null }
 *
 * const schemas = idlTypesToZod<{
 *   Person: Person
 *   Status: Status
 * }>({
 *   Person: IDL.Record({ name: IDL.Text, age: IDL.Nat }),
 *   Status: IDL.Variant({ Active: IDL.Null, Inactive: IDL.Null })
 * })
 *
 * // Now schemas have proper types:
 * // schemas.Person: z.ZodType<Person>
 * // schemas.Status: z.ZodType<Status>
 * const person = schemas.Person.parse(data) // person: Person
 * const status = schemas.Status.parse(data) // status: Status
 */
export function idlTypesToZod<
  TTypes extends Record<string, any> = Record<string, any>,
>(
  idlTypes: Record<keyof TTypes, IDL.Type>
): { [K in keyof TTypes]: z.ZodType<TTypes[K]> } {
  const result: Record<string, z.ZodTypeAny> = {}

  for (const [name, idlType] of Object.entries(idlTypes)) {
    result[name] = idlToZod(idlType)
  }

  return result as { [K in keyof TTypes]: z.ZodType<TTypes[K]> }
}

export type MethodZodResult<
  A = BaseActor,
  K extends FunctionName<A> = FunctionName<A>,
> = {
  functionType: "query" | "update"
  functionName: K
  inputSchema: z.ZodType<ActorMethodParameters<A[K]>>
  outputSchema: z.ZodType<ActorMethodReturnType<A[K]>>
}

export type FactoryZodResult<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
> = {
  [K in M]: MethodZodResult<A, K>
}

/**
 * Extract and convert all types from a Candid IDL factory.
 *
 * @param idlFactory - The IDL factory function (like those in generated files)
 * @returns Object mapping type names to Zod schemas
 *
 * @example
 * import { idlFactory } from "@/generated/escrow/escrow.did"
 *
 * const schemas = idlFactoryToZod(idlFactory)
 * // schemas will contain Zod schemas for all types defined in the IDL
 */
export function idlFactoryToZod<T extends BaseActor = BaseActor>(
  idlFactory: (args: { IDL: typeof IDL }) => IDL.ServiceClass
): FactoryZodResult<T> {
  const converter = new IDLToZodVisitor()
  const service = idlFactory({ IDL })
  const result = {} as FactoryZodResult<T>

  for (const [methodName, func] of service._fields) {
    const functionType = isQuery(func) ? "query" : "update"
    const args = func.argTypes.map((type, index) =>
      type.accept(converter, `arg${index}`)
    ) as [z.ZodTypeAny, ...z.ZodTypeAny[]]
    const rets = func.retTypes.map((type, index) =>
      type.accept(converter, `ret${index}`)
    ) as [z.ZodTypeAny, ...z.ZodTypeAny[]]

    result[methodName as FunctionName<T>] = {
      functionType,
      functionName: methodName as FunctionName<T>,
      inputSchema: z.tuple(args),
      outputSchema: z.tuple(rets),
    } as any
  }

  return result
}
