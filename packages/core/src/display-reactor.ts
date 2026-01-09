import { Reactor } from "./reactor"
import {
  didToDisplayCodec,
  transformArgsWithCodec,
  transformResultWithCodec,
  didTypeFromArray,
  ActorDisplayCodec,
} from "./display"
import {
  ActorMethodParameters,
  ActorMethodReturnType,
  FunctionName,
  ReactorArgs,
  ReactorReturnOk,
  ActorMethodCodecs,
  ReactorParameters,
  BaseActor,
} from "./types/reactor"
import { extractOkResult } from "./utils/helper"
import { ValidationError, ValidationIssue } from "./errors"

// ============================================================================
// Validation Types
// ============================================================================

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

export type DisplayReactorParameters<A = BaseActor> = ReactorParameters & {
  /**
   * Optional initial validators to register.
   * Validators receive display types (strings for Principal, bigint, etc.)
   */
  validators?: Partial<{
    [M in FunctionName<A>]: DisplayValidator<A, M>
  }>
}

// ============================================================================
// DisplayReactor
// ============================================================================

/**
 * DisplayReactor provides automatic type transformations between Candid and
 * display-friendly types, plus optional argument validation.
 *
 * ### Type Transformations
 * - `bigint` → `string` (for JSON/UI display)
 * - `Principal` → `string` (text representation)
 * - `[T] | []` → `T | null` (optional unwrapping)
 * - Small blobs → hex strings
 *
 * ### Validation (Optional)
 * Register validators to check arguments before canister calls.
 * Validators receive **display types** (strings), making them perfect for
 * form validation.
 *
 * @typeParam A - The actor service type
 *
 * @example
 * ```typescript
 * import { DisplayReactor } from "@ic-reactor/core"
 *
 * const reactor = new DisplayReactor<_SERVICE>({
 *   clientManager,
 *   canisterId: "...",
 *   idlFactory,
 * })
 *
 * // Optional: Add validation
 * reactor.registerValidator("transfer", ([input]) => {
 *   if (!input.to) {
 *     return {
 *       success: false,
 *       issues: [{ path: ["to"], message: "Recipient is required" }]
 *     }
 *   }
 *   return { success: true }
 * })
 *
 * // Call with display types
 * await reactor.callMethod({
 *   functionName: "transfer",
 *   args: [{ to: "aaaaa-aa", amount: "100" }], // strings!
 * })
 * ```
 */
export class DisplayReactor<A = BaseActor> extends Reactor<A, "display"> {
  public readonly transform = "display"
  private codecs: Map<
    string,
    { args: ActorDisplayCodec; result: ActorDisplayCodec }
  > = new Map()
  private validators: Map<string, Validator<any>> = new Map()

  constructor(config: DisplayReactorParameters<A>) {
    super(config)
    this.initializeCodecs()

    // Register initial validators if provided
    if (config.validators) {
      for (const [methodName, validator] of Object.entries(config.validators)) {
        if (validator) {
          this.validators.set(methodName, validator as Validator)
        }
      }
    }
  }

  /**
   * Initialize codecs from IDL factory for automatic type transformations
   */
  private initializeCodecs() {
    try {
      const fields = this.getServiceInterface()?._fields
      if (!fields) {
        throw new Error("No fields found")
      }
      for (const [methodName, funcType] of fields) {
        // Generate args codec
        const argsIdlType = didTypeFromArray(funcType.argTypes)
        // Generate result codec
        const retIdlType = didTypeFromArray(funcType.retTypes)
        // Set codec in map
        this.codecs.set(methodName, {
          args: didToDisplayCodec(argsIdlType),
          result: didToDisplayCodec(retIdlType),
        })
      }
    } catch (error) {
      console.error("Failed to initialize codecs:", error)
    }
  }

  // ============================================================================
  // Codec Methods
  // ============================================================================

  /**
   * Get a codec for a specific method.
   * Returns the args and result codecs for bidirectional transformation.
   * @param methodName - The name of the method
   * @returns Object with args and result codecs, or null if not found
   */
  public getCodec<M extends FunctionName<A>>(
    methodName: M
  ): ActorMethodCodecs<A, M> | null {
    const cached = this.codecs.get(methodName)
    if (cached) {
      return cached as ActorMethodCodecs<A, M>
    }

    return null
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Register a validator for a specific method.
   * Validators receive display types (strings for Principal/bigint).
   *
   * @param methodName - The name of the method to validate
   * @param validator - The validator function receiving display types
   *
   * @example
   * ```typescript
   * // input.to is string, input.amount is string
   * reactor.registerValidator("transfer", ([input]) => {
   *   if (!/^\d+$/.test(input.amount)) {
   *     return {
   *       success: false,
   *       issues: [{ path: ["amount"], message: "Must be a valid number" }]
   *     }
   *   }
   *   return { success: true }
   * })
   * ```
   */
  registerValidator<M extends FunctionName<A>>(
    methodName: M,
    validator: DisplayValidator<A, M>
  ): void {
    this.validators.set(methodName, validator)
  }

  /**
   * Unregister a validator for a specific method.
   */
  unregisterValidator<M extends FunctionName<A>>(methodName: M): void {
    this.validators.delete(methodName)
  }

  /**
   * Check if a method has a registered validator.
   */
  hasValidator<M extends FunctionName<A>>(methodName: M): boolean {
    return this.validators.has(methodName)
  }

  /**
   * Validate arguments without calling the canister.
   * Arguments are in display format (strings for Principal/bigint).
   * Useful for form validation before submission.
   *
   * @param methodName - The name of the method
   * @param args - The display-type arguments to validate
   * @returns ValidationResult indicating success or failure
   *
   * @example
   * ```typescript
   * // Validate form data before submission
   * const result = await reactor.validate("transfer", [{
   *   to: formData.recipient,  // string
   *   amount: formData.amount, // string
   * }])
   *
   * if (!result.success) {
   *   result.issues.forEach(issue => {
   *     form.setError(issue.path[0], issue.message)
   *   })
   * }
   * ```
   */
  async validate<M extends FunctionName<A>>(
    methodName: M,
    args: ReactorArgs<A, M, "display">
  ): Promise<ValidationResult> {
    const validator = this.validators.get(methodName)
    if (!validator) {
      return { success: true }
    }

    return validator(args)
  }

  /**
   * Call a method with async validation support.
   * Use this instead of callMethod() when you have async validators.
   *
   * @example
   * ```typescript
   * // Async validator (e.g., check if address is blocked)
   * reactor.registerValidator("transfer", async ([input]) => {
   *   const isBlocked = await checkBlocklist(input.to)
   *   if (isBlocked) {
   *     return {
   *       success: false,
   *       issues: [{ path: ["to"], message: "Address is blocked" }]
   *     }
   *   }
   *   return { success: true }
   * })
   *
   * await reactor.callMethodWithValidation({
   *   functionName: "transfer",
   *   args: [{ to: "...", amount: "100" }],
   * })
   * ```
   */
  async callMethodWithValidation<M extends FunctionName<A>>(params: {
    functionName: M
    args?: ReactorArgs<A, M, "display">
    callConfig?: Parameters<
      Reactor<A, "display">["callMethod"]
    >[0]["callConfig"]
  }): Promise<ReactorReturnOk<A, M, "display">> {
    // Run async validation first (on display types)
    if (params.args) {
      const result = await this.validate(params.functionName, params.args)
      if (!result.success) {
        throw new ValidationError(String(params.functionName), result.issues)
      }
    }

    // Skip synchronous validation in transformArgs by temporarily removing validator
    const validator = this.validators.get(params.functionName)
    if (validator) {
      this.validators.delete(params.functionName)
    }

    try {
      return await this.callMethod(params)
    } finally {
      // Restore validator
      if (validator) {
        this.validators.set(params.functionName, validator)
      }
    }
  }

  // ============================================================================
  // Transform Methods
  // ============================================================================

  /**
   * Transform arguments before calling the actor method.
   * 1. Validates display-type args (if validator registered)
   * 2. Converts Display → Candid
   */
  protected transformArgs<M extends FunctionName<A>>(
    methodName: M,
    args?: ReactorArgs<A, M, "display">
  ): ActorMethodParameters<A[M]> {
    // 1. Validate FIRST (on display types)
    const validator = this.validators.get(methodName)

    if (validator && args) {
      const result = validator(args)

      // Handle Promise (async validator)
      if (
        result &&
        typeof (result as Promise<ValidationResult>).then === "function"
      ) {
        throw new Error(
          `Async validators are not supported in callMethod(). ` +
            `Use reactor.callMethodWithValidation() for async validation.`
        )
      }

      const syncResult = result as ValidationResult
      if (!syncResult.success) {
        throw new ValidationError(String(methodName), syncResult.issues)
      }
    }

    // 2. THEN transform: Display → Candid
    if (this.codecs.has(methodName)) {
      const codec = this.codecs.get(methodName)!
      return transformArgsWithCodec<ActorMethodParameters<A[M]>>(
        codec.args,
        args
      )
    }
    if (!args) {
      return [] as unknown as ActorMethodParameters<A[M]>
    }
    return args as ActorMethodParameters<A[M]>
  }

  /**
   * Transform the result after calling the actor method.
   * Always extracts the Ok value from Result types (throws CanisterError on Err).
   * Also converts Candid → Display format.
   */
  protected transformResult<M extends FunctionName<A>>(
    methodName: M,
    result: ActorMethodReturnType<A[M]>
  ): ReactorReturnOk<A, M, "display"> {
    let transformedResult = result
    // 1. Apply display transformation to the FULL result
    if (this.codecs.has(methodName)) {
      const codec = this.codecs.get(methodName)!
      transformedResult = transformResultWithCodec(codec.result, result)
    }

    // 2. Extract Ok value from the TRANSFORMED (or raw) result
    //    This handles { ok: T } / { err: E } from Motoko/Rust canisters
    return extractOkResult(transformedResult) as ReactorReturnOk<
      A,
      M,
      "display"
    >
  }
}

// ============================================================================
// Zod Integration Helper
// ============================================================================

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
