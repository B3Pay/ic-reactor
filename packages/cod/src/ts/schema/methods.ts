import { CandidTextParser } from "./candid-text.js"
import type { AnySchema, Infer, InferWire } from "./core.js"
import { assertTupleLength, candidLabel } from "./utils.js"

/**
 * Candid service method call mode.
 */
export type MethodMode = "query" | "update"

/**
 * Accepted return schema input for method constructors.
 */
export type ReturnInput = AnySchema | readonly AnySchema[] | undefined

/**
 * Normalizes method return input into a readonly tuple of schemas.
 *
 * @typeParam Returns - Return input passed to a method constructor.
 */
export type NormalizeReturns<Returns extends ReturnInput> =
  Returns extends undefined
    ? readonly []
    : Returns extends AnySchema
      ? readonly [Returns]
      : Returns extends readonly AnySchema[]
        ? Returns
        : never

/**
 * App-level tuple type inferred from a tuple of schemas.
 *
 * @typeParam Schemas - Schemas to infer app values from.
 */
export type AppTuple<Schemas extends readonly AnySchema[]> = {
  readonly [Key in keyof Schemas]: Infer<Schemas[Key]>
}

/**
 * Wire-level tuple type inferred from a tuple of schemas.
 *
 * @typeParam Schemas - Schemas to infer wire values from.
 */
export type WireTuple<Schemas extends readonly AnySchema[]> = {
  readonly [Key in keyof Schemas]: InferWire<Schemas[Key]>
}

/**
 * App-level return value shape for a method.
 *
 * Methods with no returns resolve to `undefined`; methods with one return
 * resolve to that value directly; methods with multiple returns resolve to a tuple.
 *
 * @typeParam Returns - Normalized return schema tuple.
 */
export type MethodReturn<Returns extends readonly AnySchema[]> =
  Returns extends readonly []
    ? undefined
    : Returns extends readonly [infer Only extends AnySchema]
      ? Infer<Only>
      : AppTuple<Returns>

/**
 * Runtime schema for a Candid service method.
 *
 * @typeParam Args - Method argument schema tuple.
 * @typeParam Returns - Method return schema tuple.
 * @typeParam Mode - Method call mode.
 */
export class MethodSchema<
  Args extends readonly AnySchema[],
  Returns extends readonly AnySchema[],
  Mode extends MethodMode,
> {
  /** Ordered argument schemas. */
  readonly args: Args

  /** Ordered return schemas. */
  readonly returns: Returns

  /** Method call mode. */
  readonly mode: Mode

  /**
   * Creates a method schema from argument schemas, return schemas, and mode.
   *
   * @param args - Ordered argument schemas.
   * @param returns - Ordered return schemas.
   * @param mode - Method call mode.
   */
  constructor(args: Args, returns: Returns, mode: Mode) {
    this.args = args
    this.returns = returns
    this.mode = mode
  }

  /**
   * Renders the Candid argument type list for this method.
   *
   * @returns Comma-separated Candid argument type text.
   */
  argsDid(): string {
    return this.args.map((schema) => schema.wireDid()).join(", ")
  }

  /**
   * Renders the Candid return type list for this method.
   *
   * @returns Comma-separated Candid return type text.
   */
  returnsDid(): string {
    return this.returns.map((schema) => schema.wireDid()).join(", ")
  }

  /**
   * Renders this method as a service field in Candid DID syntax.
   *
   * @param name - Method name to render.
   * @returns Candid service method field text.
   */
  toDid(name: string): string {
    const mode = this.mode === "query" ? " query" : ""
    return `${candidLabel(name)} : (${this.argsDid()}) -> (${this.returnsDid()})${mode}`
  }

  /**
   * Converts app-level method arguments into Candid text.
   *
   * @param args - App-level arguments.
   * @returns Parenthesized Candid argument tuple text.
   * @throws If the number of arguments does not match this method schema.
   */
  argsToCandid(args: AppTuple<Args>): string {
    assertTupleLength(args, this.args.length, "method arguments")
    return tupleText(this.args, args)
  }

  /**
   * Converts an app-level method reply into Candid text.
   *
   * @param value - App-level return value.
   * @returns Parenthesized Candid reply tuple text.
   * @throws If a multi-return value has the wrong tuple length.
   */
  replyToCandid(value: MethodReturn<Returns>): string {
    return tupleText(this.returns, returnValueToTuple(this.returns, value))
  }

  /**
   * Decodes app-level arguments from Candid text.
   *
   * @param text - Parenthesized Candid argument tuple text.
   * @returns App-level argument tuple.
   */
  decodeArgsText(text: string): AppTuple<Args> {
    const wires = parseTupleText(text, this.args)
    return this.args.map((schema, index) =>
      schema.fromWire(wires[index])
    ) as AppTuple<Args>
  }

  /**
   * Decodes an app-level reply value from Candid text.
   *
   * @param text - Parenthesized Candid reply tuple text.
   * @returns App-level method return value.
   */
  decodeReplyText(text: string): MethodReturn<Returns> {
    const wires = parseTupleText(text, this.returns)
    const apps = this.returns.map((schema, index) =>
      schema.fromWire(wires[index])
    ) as AppTuple<Returns>
    return tupleToReturnValue(apps) as MethodReturn<Returns>
  }
}

/**
 * Any method schema regardless of argument, return, or mode types.
 */
export type AnyMethodSchema = MethodSchema<
  readonly AnySchema[],
  readonly AnySchema[],
  MethodMode
>

/**
 * Extracts the app-level argument tuple from a method schema.
 *
 * @typeParam Method - Method schema to inspect.
 */
export type MethodArgs<Method extends AnyMethodSchema> =
  Method extends MethodSchema<infer Args, readonly AnySchema[], MethodMode>
    ? AppTuple<Args>
    : never

/**
 * Extracts the app-level return value from a method schema.
 *
 * @typeParam Method - Method schema to inspect.
 */
export type MethodResult<Method extends AnyMethodSchema> =
  Method extends MethodSchema<readonly AnySchema[], infer Returns, MethodMode>
    ? MethodReturn<Returns>
    : never

/**
 * Mapping of service method names to method schemas.
 */
export type MethodMap = Record<string, AnyMethodSchema>

/**
 * Creates an update method schema.
 *
 * @typeParam Args - Argument schema tuple.
 * @typeParam Returns - Return schema input.
 * @param args - Ordered argument schemas.
 * @param returns - Optional return schema or return schema tuple.
 * @returns Update method schema.
 */
export function method<
  const Args extends readonly AnySchema[],
  const Returns extends ReturnInput = undefined,
>(
  args: Args,
  returns?: Returns
): MethodSchema<Args, NormalizeReturns<Returns>, "update"> {
  return new MethodSchema(args, normalizeReturns(returns as Returns), "update")
}

/**
 * Creates a query method schema.
 *
 * @typeParam Args - Argument schema tuple.
 * @typeParam Returns - Return schema input.
 * @param args - Ordered argument schemas.
 * @param returns - Optional return schema or return schema tuple.
 * @returns Query method schema.
 */
export function query<
  const Args extends readonly AnySchema[],
  const Returns extends ReturnInput = undefined,
>(
  args: Args,
  returns?: Returns
): MethodSchema<Args, NormalizeReturns<Returns>, "query"> {
  return new MethodSchema(args, normalizeReturns(returns as Returns), "query")
}

/**
 * Creates an update method schema.
 *
 * @typeParam Args - Argument schema tuple.
 * @typeParam Returns - Return schema input.
 * @param args - Ordered argument schemas.
 * @param returns - Optional return schema or return schema tuple.
 * @returns Update method schema.
 */
export function update<
  const Args extends readonly AnySchema[],
  const Returns extends ReturnInput = undefined,
>(
  args: Args,
  returns?: Returns
): MethodSchema<Args, NormalizeReturns<Returns>, "update"> {
  return new MethodSchema(args, normalizeReturns(returns as Returns), "update")
}

/**
 * Normalizes method constructor return input to a schema tuple.
 *
 * @typeParam Returns - Return input type.
 * @param returns - Optional return schema or return schema tuple.
 * @returns Normalized return schema tuple.
 */
function normalizeReturns<const Returns extends ReturnInput>(
  returns: Returns
): NormalizeReturns<Returns> {
  if (returns === undefined) {
    return [] as unknown as NormalizeReturns<Returns>
  }
  return (Array.isArray(returns)
    ? returns
    : [returns]) as unknown as NormalizeReturns<Returns>
}

/**
 * Converts app-level tuple values into Candid tuple text with the provided schemas.
 *
 * @typeParam Schemas - Schemas for each tuple position.
 * @param schemas - Ordered schemas.
 * @param values - App-level values aligned with `schemas`.
 * @returns Parenthesized Candid tuple text.
 * @throws If the number of values does not match the schema tuple length.
 */
function tupleText<Schemas extends readonly AnySchema[]>(
  schemas: Schemas,
  values: readonly unknown[]
): string {
  assertTupleLength(values, schemas.length, "tuple")
  return `(${schemas.map((schema, index) => schema.toCandid(values[index])).join(", ")})`
}

/**
 * Parses wire-level tuple values from Candid tuple text.
 *
 * @typeParam Schemas - Schemas for each tuple position.
 * @param text - Parenthesized Candid tuple text.
 * @param schemas - Ordered schemas to parse with.
 * @returns Wire-level tuple values.
 */
function parseTupleText<Schemas extends readonly AnySchema[]>(
  text: string,
  schemas: Schemas
): WireTuple<Schemas> {
  const parser = new CandidTextParser(text)
  parser.expectChar("(")
  const values = schemas.map((schema, index) => {
    const value = schema.parseWire(parser)
    if (index < schemas.length - 1) {
      parser.expectChar(",")
    } else {
      parser.consumeChar(",")
    }
    return value
  })
  parser.expectChar(")")
  parser.expectEnd()
  return values as WireTuple<Schemas>
}

/**
 * Converts the public method return shape into an internal tuple.
 *
 * @typeParam Returns - Normalized return schema tuple.
 * @param returns - Return schemas.
 * @param value - Public app-level return value.
 * @returns Tuple-aligned app-level return values.
 * @throws If a multi-return value has the wrong tuple length.
 */
function returnValueToTuple<Returns extends readonly AnySchema[]>(
  returns: Returns,
  value: MethodReturn<Returns>
): AppTuple<Returns> {
  if (returns.length === 0) {
    return [] as AppTuple<Returns>
  }
  if (returns.length === 1) {
    return [value] as unknown as AppTuple<Returns>
  }
  assertTupleLength(
    value as readonly unknown[],
    returns.length,
    "method return"
  )
  return value as AppTuple<Returns>
}

/**
 * Converts a tuple of return values into the public method return shape.
 *
 * @param values - Tuple-aligned app-level return values.
 * @returns `undefined`, the single value, or the tuple depending on return count.
 */
function tupleToReturnValue(values: readonly unknown[]): unknown {
  if (values.length === 0) {
    return undefined
  }
  if (values.length === 1) {
    return values[0]
  }
  return values
}
