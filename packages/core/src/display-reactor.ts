import { Reactor } from "./reactor.js"
import {
  didToDisplayCodec,
  transformArgsWithCodec,
  transformResultWithCodec,
  didTypeFromArray,
  ActorDisplayCodec,
} from "./display/index.js"
import {
  ActorMethodParameters,
  ActorMethodReturnType,
  FunctionName,
  ReactorArgs,
  ReactorReturnOk,
  ActorMethodCodecs,
  BaseActor,
  TransformKey,
} from "./types/reactor.js"
import { extractOkResult } from "./utils/helper.js"
import { CanisterError, ValidationError } from "./errors/index.js"
import {
  DisplayReactorParameters,
  DisplayValidator,
  ValidationResult,
  Validator,
} from "./types/display-reactor.js"

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
 * - Blobs (`vec nat8`) → hex strings, at every size
 *
 * ### Validation (Optional)
 * Register validators to check arguments before canister calls.
 * Validators receive **display types** (strings), making them perfect for
 * form validation.
 *
 * Use `DisplayReactor` for UI/forms where principals and numeric values should
 * be string-friendly. Use `Reactor` when you need raw Candid types directly.
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
export class DisplayReactor<
  A = BaseActor,
  T extends TransformKey = "display",
> extends Reactor<A, T> {
  public readonly transform = "display" as T
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
    args: ReactorArgs<A, M, T>
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
    args?: ReactorArgs<A, M, T>
    callConfig?: Parameters<
      Reactor<A, "display">["callMethod"]
    >[0]["callConfig"]
  }): Promise<ReactorReturnOk<A, M, T>> {
    // Run async validation first (on display types)
    if (params.args) {
      const result = await this.validate(params.functionName, params.args)
      if (!result.success) {
        throw new ValidationError(String(params.functionName), result.issues)
      }
    }

    // The validator has already run above, so `transformArgs` must not run it
    // again synchronously (it would reject an async validator outright). It is
    // removed to achieve that — but `validators` is shared reactor state, so the
    // removal must not outlive this call's synchronous section, or every other
    // caller is unvalidated for the 2-15s an update takes: a second submit, a
    // different component calling callMethod(), or a form calling validate() on
    // change, which would report success for input it otherwise rejects.
    //
    // `callMethod` invokes `transformArgs` synchronously, before it awaits
    // anything, so starting the call and restoring the validator in the same
    // tick keeps the gap unobservable — no other code can interleave. The
    // promise is awaited only after the validator is back in place.
    const validator = this.validators.get(params.functionName)
    if (validator) {
      this.validators.delete(params.functionName)
    }

    let pending: Promise<ReactorReturnOk<A, M, T>>
    try {
      // @ts-ignore
      pending = this.callMethod(params)
    } finally {
      if (validator) {
        this.validators.set(params.functionName, validator)
      }
    }

    return await pending
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
    args?: ReactorArgs<A, M, T>
  ): ActorMethodParameters<A[M]> {
    // 1. Validate FIRST (on display types)
    const validator = this.validators.get(methodName)
    const displayArgs = args as unknown as ReactorArgs<A, M, "display">

    if (validator && displayArgs) {
      const result = validator(displayArgs)

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
        displayArgs
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
  ): ReactorReturnOk<A, M, T> {
    let transformedResult = result
    // 1. Apply display transformation to the FULL result
    if (this.codecs.has(methodName)) {
      const codec = this.codecs.get(methodName)!
      transformedResult = transformResultWithCodec(codec.result, result)

      // The display codec renders a null variant arm as `{ _type: key }` with
      // no payload key, so Result<(), E>'s Ok and Result<T, ()>'s Err arrive
      // here without the key extractOkResult looks for: an empty Err would be
      // returned as the success value, an empty Ok as a truthy object where
      // the declared display type is null. Unwrap those two shapes the way
      // their raw forms unwrap. Arms with a payload keep their key.
      if (isEmptyDisplayArm(transformedResult, OK_TAGS)) {
        return null as ReactorReturnOk<A, M, T>
      }
      if (isEmptyDisplayArm(transformedResult, ERR_TAGS)) {
        throw new CanisterError(null)
      }
    }

    // 2. Extract Ok value from the TRANSFORMED (or raw) result
    //    This handles { ok: T } / { err: E } from Motoko/Rust canisters
    return extractOkResult(transformedResult) as unknown as ReactorReturnOk<
      A,
      M,
      T
    >
  }
}

const OK_TAGS = ["Ok", "ok"]
const ERR_TAGS = ["Err", "err"]

/**
 * A display-transformed variant arm with no payload is exactly `{ _type: key }`
 * and nothing else. The key count is what separates it from a record that
 * happens to carry a text field called `_type`, which keeps its other fields.
 */
function isEmptyDisplayArm(value: unknown, tags: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  return (
    keys.length === 1 &&
    keys[0] === "_type" &&
    tags.includes((value as { _type: unknown })._type as string)
  )
}
