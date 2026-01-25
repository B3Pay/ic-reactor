// ============================================================================
// Zod Integration Helper
// ============================================================================

import { ValidationIssue } from "../errors"
import { ValidationResult, Validator } from "../types"

/**
 * Create a validator from a Zod schema.
 * This is a utility function to easily integrate Zod schemas as validators.
 *
 * @param schema - A Zod schema to validate against
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
 */
export function fromZodSchema<T>(schema: {
  safeParse: (data: unknown) => {
    success: boolean
    error?: {
      issues: Array<{
        path: (string | number)[]
        message: string
        code?: string
      }>
    }
  }
}): Validator<T[]> {
  return (args: T[]): ValidationResult => {
    // Validate the first argument (common IC pattern)
    const result = schema.safeParse(args[0])

    if (result.success) {
      return { success: true }
    }

    const issues: ValidationIssue[] = result.error!.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    }))

    return { success: false, issues }
  }
}
