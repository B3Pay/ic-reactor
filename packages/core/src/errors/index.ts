import { NullishType } from "../display/types"

/**
 * Interface representing the generic shape of an API error.
 */
export interface ApiError {
  code: string
  message: NullishType<string>
  details: NullishType<Map<string, string>>
}

/**
 * Error thrown when there's an issue calling the canister.
 * This includes network errors, agent errors, canister not found, etc.
 */
export class CallError extends Error {
  public readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "CallError"
    this.cause = cause

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CallError)
    }
  }
}

/**
 * Error thrown when the canister returns an Err result.
 * The `err` property contains the typed error value from the canister.
 *
 * It also supports accessing `code`, `message`, and `details` directly
 * if the error object follows the common API error format or is a variant.
 *
 * @typeParam E - The type of the error value from the canister
 */
export class CanisterError<E = unknown> extends Error {
  /** The raw error value from the canister */
  public readonly err: E
  /** The error code, extracted from the error object or variant key */
  public readonly code: string
  /** Optional error details Map */
  public readonly details: NullishType<Map<string, string>>

  constructor(err: E) {
    let code: string | undefined
    let message: string | undefined
    let details: NullishType<Map<string, string>> = undefined
    let isApiShape = false

    if (typeof err === "object" && err !== null) {
      // 1. Check for structured ApiError shape (has code)
      if ("code" in err && typeof err.code === "string") {
        code = err.code
        isApiShape = true
        if ("message" in err && typeof err.message === "string") {
          message = err.message
        }
        if ("details" in err) {
          details = err.details as any
        }
      }
      // 2. Check for ic-reactor transformed variant shape (_type)
      else if ("_type" in err && typeof err._type === "string") {
        code = err._type
      }
      // 3. Simple variant check (single key object)
      else {
        const keys = Object.keys(err)
        if (keys.length === 1) {
          code = keys[0]
        }
      }
    }

    const finalCode = code ?? "UNKNOWN_ERROR"
    const finalMessage =
      message ??
      (typeof err === "object" && err !== null
        ? JSON.stringify(
            err,
            (_, v) => (typeof v === "bigint" ? v.toString() : v),
            2
          )
        : String(err))

    super(isApiShape ? finalMessage : `Canister Error: ${finalMessage}`)
    this.name = "CanisterError"
    this.err = err
    this.code = finalCode
    this.details = details

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CanisterError)
    }
  }

  /**
   * Type guard to check if an error object follows the API error format.
   */
  static isApiError(error: unknown): error is ApiError {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && "message" in error && "details" in error
  }

  /**
   * Factory method to create a CanisterError from any error.
   * If the input is already a CanisterError, it returns it.
   * If it's an API error shape, it wraps it.
   * Otherwise, it creates a new CanisterError with an "UNKNOWN_ERROR" code.
   */
  static create(error: unknown, message?: string): CanisterError {
    if (error instanceof CanisterError) {
      return error
    }

    if (CanisterError.isApiError(error)) {
      return new CanisterError(error)
    }

    return new CanisterError({
      code: "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : message || "An unknown error occurred",
      details: undefined,
    } as any)
  }
}

/**
 * Type guard to check if an error is a CanisterError.
 * Preserves the generic type E from the input when used in type narrowing.
 *
 * @example
 * ```typescript
 * // err is typed as CanisterError<TransferError> | CallError
 * if (isCanisterError(err)) {
 *   // err.err is typed as TransferError (preserved!)
 *   console.log(err.err)
 * }
 * ```
 */
export function isCanisterError<E>(
  error: CanisterError<E> | CallError
): error is CanisterError<E>
export function isCanisterError(error: unknown): error is CanisterError<unknown>
export function isCanisterError(
  error: unknown
): error is CanisterError<unknown> {
  return error instanceof CanisterError
}

/**
 * Type guard to check if an error is a CallError
 */
export function isCallError(error: unknown): error is CallError {
  return error instanceof CallError
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Represents a single validation issue
 */
export interface ValidationIssue {
  /** Path to the invalid field (e.g., ["to", "amount"]) */
  path: (string | number)[]
  /** Human-readable error message */
  message: string
  /** Validation code (e.g., "required", "min_length") */
  code?: string
}

/**
 * Error thrown when argument validation fails before calling the canister.
 * Contains detailed information about which fields failed validation.
 *
 * @example
 * ```typescript
 * try {
 *   await reactor.callMethod({
 *     functionName: "transfer",
 *     args: [{ to: "", amount: -100 }],
 *   })
 * } catch (error) {
 *   if (isValidationError(error)) {
 *     console.log(error.issues)
 *     // [
 *     //   { path: ["to"], message: "Recipient is required" },
 *     //   { path: ["amount"], message: "Amount must be positive" }
 *     // ]
 *   }
 * }
 * ```
 */
export class ValidationError extends Error {
  /** Array of validation issues */
  public readonly issues: ValidationIssue[]
  /** The method name that failed validation */
  public readonly methodName: string

  constructor(methodName: string, issues: ValidationIssue[]) {
    const messages = issues.map((i) => i.message).join(", ")
    super(`Validation failed for "${methodName}": ${messages}`)
    this.name = "ValidationError"
    this.methodName = methodName
    this.issues = issues

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError)
    }
  }

  /**
   * Get issues for a specific field path
   */
  getIssuesForPath(path: string): ValidationIssue[] {
    return this.issues.filter((issue) => issue.path.includes(path))
  }

  /**
   * Check if a specific field has errors
   */
  hasErrorForPath(path: string): boolean {
    return this.issues.some((issue) => issue.path.includes(path))
  }
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}
