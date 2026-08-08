import { NullishType } from "../display/types.js"

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
    const MAX_ERR_MESSAGE_LENGTH = 2048
    const finalMessage =
      message ??
      (typeof err === "object" && err !== null
        ? (() => {
            const serialized =
              JSON.stringify(
                err,
                (_, v) => (typeof v === "bigint" ? v.toString() : v),
                2
              ) ?? String(err)
            return serialized.length > MAX_ERR_MESSAGE_LENGTH
              ? serialized.slice(0, MAX_ERR_MESSAGE_LENGTH) + "… [truncated]"
              : serialized
          })()
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

/**
 * Reject codes the IC defines as retryable. Everything else is a decision the
 * replica will repeat for an identical call.
 *
 * @see https://internetcomputer.org/docs/references/ic-interface-spec#reject-codes
 */
const RETRYABLE_REJECT_CODES = new Set([
  2, // SysTransient — the system was temporarily unable to process the call
  6, // SysUnknown — the outcome is genuinely unknown, so a retry can resolve it
])

/**
 * Whether retrying a failed canister call could plausibly produce a different
 * result.
 *
 * The rule is "retry only what the agent reports as a condition that could
 * differ next time". Concretely:
 *
 * - {@link CanisterError} — the canister returned an `Err` variant. Never.
 * - {@link ValidationError} — refused by a validator client-side. Never.
 * - {@link CallError} — `Reactor.callMethod` wraps *everything* else in one of
 *   these, including our own Candid encode/decode and transform failures, so
 *   the wrapper alone says nothing. The decision comes from the cause:
 *   - an agent error (it carries a `kind`): retried, except for a rejection
 *     whose reject code is one the replica will simply repeat;
 *   - anything else: not retried, because no agent error means no request was
 *     ever made — the failure happened in encoding, decoding or transforming,
 *     and the identical input produces the identical failure.
 * - any other error: not retried, for the same reason.
 *
 * Within agent errors the bias is toward retrying: an unrecognised `kind`, or a
 * rejection whose code cannot be read, still retries, so an unfamiliar
 * transport-level fault is never silently made fatal.
 *
 * @example Opt in on a QueryClient you construct yourself
 * ```ts
 * new QueryClient({
 *   defaultOptions: { queries: { retry: reactorRetry } },
 * })
 * ```
 */
export function isRetryableReactorError(error: unknown): boolean {
  if (isCanisterError(error)) return false
  if (isValidationError(error)) return false
  if (!isCallError(error)) return false

  const cause = error.cause

  // No agent error underneath means the request never went out: an IDL encode
  // or decode failure, or a transform fault. Retrying re-runs identical input.
  if (!isAgentErrorLike(cause)) return false

  const rejectCode = readRejectCode(cause)
  if (typeof rejectCode === "number") {
    return RETRYABLE_REJECT_CODES.has(rejectCode)
  }

  // Transport, protocol and certificate failures carry no reject code.
  return true
}

/**
 * Does this look like an error raised by the agent rather than by our own
 * encoding?
 *
 * Agent errors expose a `kind` ("Transport", "Reject", "Trust", "Protocol");
 * a rejection additionally carries a reject code. A plain `Error` or
 * `TypeError` from `IDL.encode`/`IDL.decode` has neither.
 */
function isAgentErrorLike(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false
  const candidate = cause as { kind?: unknown }
  if (typeof candidate.kind === "string") return true
  return readRejectCode(cause) !== undefined
}

/**
 * Pull the reject code out of a `CallError.cause`.
 *
 * The agent nests it: the cause is a `RejectError` whose `code` is a
 * `…RejectErrorCode` carrying `rejectCode`. The flat position is checked too,
 * so a hand-built or future-shaped cause still classifies.
 */
function readRejectCode(cause: unknown): number | undefined {
  const candidate = cause as
    { rejectCode?: unknown; code?: { rejectCode?: unknown } } | undefined
  if (typeof candidate?.rejectCode === "number") return candidate.rejectCode
  if (typeof candidate?.code?.rejectCode === "number") {
    return candidate.code.rejectCode
  }
  return undefined
}

export function reactorRetry(failureCount: number, error: unknown): boolean {
  // TanStack defaults to zero retries on the server. Supplying a predicate
  // overrides that, so a failed prefetch or render would pick up the 1s/2s/4s
  // backoffs and add seven seconds to a request that used to fail fast.
  if (typeof window === "undefined") return false
  return failureCount < 3 && isRetryableReactorError(error)
}
