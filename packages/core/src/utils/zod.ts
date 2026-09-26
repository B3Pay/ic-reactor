// ============================================================================
// Zod Integration Helper
// ============================================================================

import { ValidationIssue } from "../errors/index.js"
import { ValidationResult, Validator } from "../types/index.js"

/** What zod's `safeParse` and `safeParseAsync` return, as far as it is read. */
interface ZodParseResult {
  success: boolean
  error?: {
    issues: Array<{
      // zod 4 types a path as PropertyKey[], zod 3 as (string | number)[].
      path: PropertyKey[]
      message: string
      code?: string
    }>
  }
}

/** A schema {@link fromZodSchema} parses synchronously. */
interface ZodSyncSchema {
  safeParse: (data: unknown) => ZodParseResult
}

/** A schema {@link fromZodSchema} parses with `{ async: true }`. */
interface ZodAsyncSchema {
  safeParseAsync: (data: unknown) => Promise<ZodParseResult>
}

/**
 * Options for {@link fromZodSchema}.
 */
export interface FromZodSchemaOptions {
  /**
   * Parse with `safeParseAsync` instead of `safeParse`, for a schema with an
   * async refinement or transform. zod refuses such a schema on the
   * synchronous path, for valid and invalid input alike.
   *
   * The validator then returns a promise, so it runs where async validators
   * do: `validate()` and `callMethodWithValidation()`. `callMethod()`, and
   * the query and mutation hooks and factories that call it, run validators
   * synchronously and refuse the call.
   *
   * @default false
   */
  async?: boolean
}

/** The zod result as a {@link ValidationResult}. */
function toValidationResult(result: ZodParseResult): ValidationResult {
  if (result.success) {
    return { success: true }
  }

  const issues: ValidationIssue[] = result.error!.issues.map((issue) => ({
    // ValidationIssue paths hold strings and numbers, so a symbol key is
    // stored by its description text.
    path: issue.path.map((key) =>
      typeof key === "symbol" ? key.toString() : key
    ),
    message: issue.message,
    code: issue.code,
  }))

  return { success: false, issues }
}

/**
 * Create a validator from a Zod schema.
 * This is a utility function to easily integrate Zod schemas as validators.
 *
 * The schema checks the method's first argument. A schema with an async
 * refinement or transform needs `{ async: true }`, and gives an async
 * validator: see {@link FromZodSchemaOptions.async}.
 *
 * @param schema - A Zod schema to validate against: anything with zod's
 * `safeParse`, or with its `safeParseAsync` for `{ async: true }`
 * @param options - Pass `{ async: true }` to parse with `safeParseAsync`
 * @returns A Validator function compatible with DisplayReactor
 *
 * @example
 * ```typescript
 * import { z } from "zod"
 * import { fromZodSchema } from "@ic-reactor/core"
 *
 * const transferSchema = z.object({
 *   to: z.string().min(1, "Recipient is required"),
 *   amount: z.string().regex(/^\d+$/, "Must be a valid number"),
 * })
 *
 * reactor.registerValidator("transfer", fromZodSchema(transferSchema))
 * ```
 *
 * @example An async refinement
 * ```typescript
 * const recipientSchema = z.object({
 *   to: z.string().refine(async (to) => !(await isBlocked(to)), "Address is blocked"),
 * })
 *
 * reactor.registerValidator(
 *   "transfer",
 *   fromZodSchema(recipientSchema, { async: true })
 * )
 * await reactor.callMethodWithValidation({ functionName: "transfer", args })
 * ```
 */
export function fromZodSchema<T>(
  schema: ZodSyncSchema,
  options?: FromZodSchemaOptions & { async?: false }
): Validator<T[]>
export function fromZodSchema<T>(
  schema: ZodAsyncSchema,
  options: FromZodSchemaOptions & { async: true }
): Validator<T[]>
export function fromZodSchema<T>(
  schema: ZodSyncSchema & ZodAsyncSchema,
  options?: FromZodSchemaOptions
): Validator<T[]>
export function fromZodSchema<T>(
  schema: ZodSyncSchema | ZodAsyncSchema,
  options?: FromZodSchemaOptions
): Validator<T[]> {
  // Validate the first argument (common IC pattern)
  if (options?.async) {
    return async (args: T[]): Promise<ValidationResult> =>
      toValidationResult(
        await (schema as ZodAsyncSchema).safeParseAsync(args[0])
      )
  }
  return (args: T[]): ValidationResult =>
    toValidationResult((schema as ZodSyncSchema).safeParse(args[0]))
}
