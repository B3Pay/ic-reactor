// ============================================================================
// Validation Types
// ============================================================================

import { ValidationIssue } from "../errors"
import {
  BaseActor,
  FunctionName,
  ReactorArgs,
  ReactorParameters,
} from "./reactor"

/**
 * Validation result returned by a validator function.
 * Either success (true) or failure with issues.
 */
export type ValidationResult =
  | { success: true }
  | { success: false; issues: ValidationIssue[] }

/**
 * A validator function that validates method arguments.
 * Receives display types (strings for Principal, bigint, etc.).
 *
 * @param args - The display-type arguments to validate
 * @returns ValidationResult indicating success or failure with issues
 *
 * @example
 * ```typescript
 * // Validator receives display types
 * reactor.registerValidator("transfer", ([input]) => {
 *   const issues = []
 *
 *   // input.to is string (not Principal)
 *   if (!input.to) {
 *     issues.push({ path: ["to"], message: "Recipient is required" })
 *   }
 *
 *   // input.amount is string (not bigint)
 *   if (!/^\d+$/.test(input.amount)) {
 *     issues.push({ path: ["amount"], message: "Must be a valid number" })
 *   }
 *
 *   return issues.length > 0 ? { success: false, issues } : { success: true }
 * })
 * ```
 */
export type Validator<Args = unknown[]> = (
  args: Args
) => ValidationResult | Promise<ValidationResult>

/**
 * Validator that receives display types for a specific method.
 */
export type DisplayValidator<A, M extends FunctionName<A>> = Validator<
  ReactorArgs<A, M, "display">
>

// ============================================================================
// DisplayReactor Parameters
// ============================================================================

export interface DisplayReactorParameters<
  A = BaseActor,
> extends ReactorParameters {
  /**
   * Optional initial validators to register.
   * Validators receive display types (strings for Principal, bigint, etc.)
   */
  validators?: Partial<{
    [M in FunctionName<A>]: DisplayValidator<A, M>
  }>
}
