/**
 * Validation utilities for React
 *
 * Helpers for working with ValidationError in React components,
 * especially for form integration.
 */

import {
  ValidationError,
  isValidationError,
  ValidationIssue,
} from "@ic-reactor/core"

// Re-export for convenience
export { isValidationError, ValidationError }
export type { ValidationIssue }

/**
 * A map of field names to error messages.
 * This format is compatible with most form libraries.
 */
export type FieldErrors = Record<string, string>

/**
 * A map of field names to arrays of error messages.
 * Use when you need to show multiple errors per field.
 */
export type FieldErrorsMultiple = Record<string, string[]>

/**
 * Options for mapValidationErrors
 */
export interface MapValidationErrorsOptions {
  /**
   * If true, returns all messages for each field as an array.
   * If false (default), returns only the first message for each field.
   */
  multiple?: boolean
}

/**
 * Maps validation error issues to a simple field -> message object.
 * Returns the first error message for each field path.
 *
 * @example
 * ```tsx
 * const { mutate } = useActorMutation({
 *   functionName: "transfer",
 *   onError: (error) => {
 *     if (isValidationError(error)) {
 *       const fieldErrors = mapValidationErrors(error)
 *       // { to: "Recipient is required", amount: "Must be a number" }
 *
 *       // Use with React Hook Form
 *       Object.entries(fieldErrors).forEach(([field, message]) => {
 *         form.setError(field, { message })
 *       })
 *     }
 *   }
 * })
 * ```
 */
export function mapValidationErrors(error: ValidationError): FieldErrors
export function mapValidationErrors(
  error: ValidationError,
  options: { multiple: true }
): FieldErrorsMultiple
export function mapValidationErrors(
  error: ValidationError,
  options: { multiple: false }
): FieldErrors
export function mapValidationErrors(
  error: ValidationError,
  options?: MapValidationErrorsOptions
): FieldErrors | FieldErrorsMultiple {
  if (options?.multiple) {
    const result: FieldErrorsMultiple = {}
    for (const issue of error.issues) {
      const fieldName = String(issue.path[0] ?? "")
      if (!result[fieldName]) {
        result[fieldName] = []
      }
      result[fieldName].push(issue.message)
    }
    return result
  }

  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const fieldName = String(issue.path[0] ?? "")
    if (!result[fieldName]) {
      result[fieldName] = issue.message
    }
  }
  return result
}

/**
 * Gets error message for a specific field from a ValidationError.
 * Returns undefined if no error exists for that field.
 *
 * @example
 * ```tsx
 * if (isValidationError(error)) {
 *   const toError = getFieldError(error, "to")
 *   const amountError = getFieldError(error, "amount")
 * }
 * ```
 */
export function getFieldError(
  error: ValidationError,
  fieldName: string
): string | undefined {
  const issue = error.issues.find((i) => String(i.path[0]) === fieldName)
  return issue?.message
}

/**
 * Gets all error messages for a specific field from a ValidationError.
 * Returns empty array if no errors exist for that field.
 *
 * @example
 * ```tsx
 * if (isValidationError(error)) {
 *   const amountErrors = getFieldErrors(error, "amount")
 *   // ["Amount is required", "Amount must be positive"]
 * }
 * ```
 */
export function getFieldErrors(
  error: ValidationError,
  fieldName: string
): string[] {
  return error.issues
    .filter((i) => String(i.path[0]) === fieldName)
    .map((i) => i.message)
}

/**
 * Checks if a given error is a ValidationError and optionally
 * extracts field errors in one step.
 *
 * @example
 * ```tsx
 * const { mutateAsync } = useActorMutation({ functionName: "transfer" })
 *
 * const handleSubmit = async (data) => {
 *   try {
 *     await mutateAsync([data])
 *   } catch (error) {
 *     const fieldErrors = extractValidationErrors(error)
 *     if (fieldErrors) {
 *       // Handle validation errors
 *       Object.entries(fieldErrors).forEach(([field, message]) => {
 *         form.setError(field, { message })
 *       })
 *     } else {
 *       // Handle other errors
 *       console.error(error)
 *     }
 *   }
 * }
 * ```
 */
export function extractValidationErrors(error: unknown): FieldErrors | null {
  if (isValidationError(error)) {
    return mapValidationErrors(error)
  }
  return null
}

/**
 * React hook-friendly error handler that extracts validation errors.
 * Returns a callback suitable for onError handlers.
 *
 * @example
 * ```tsx
 * const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
 *
 * const { mutate } = useActorMutation({
 *   functionName: "transfer",
 *   onError: handleValidationError(setFieldErrors),
 * })
 *
 * // In JSX
 * <input name="to" />
 * {fieldErrors.to && <span className="error">{fieldErrors.to}</span>}
 * ```
 */
export function handleValidationError(
  setFieldErrors: (errors: FieldErrors) => void,
  onOtherError?: (error: Error) => void
): (error: Error) => void {
  return (error: Error) => {
    const fieldErrors = extractValidationErrors(error)
    if (fieldErrors) {
      setFieldErrors(fieldErrors)
    } else if (onOtherError) {
      onOtherError(error)
    }
  }
}
